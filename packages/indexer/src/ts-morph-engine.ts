import {
  type ClassDeclaration,
  type Decorator,
  Project,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';
import type { AstEngine } from './ast-engine';
import { sha256 } from './hash';
import type {
  Chunk,
  DecoratorInfo,
  FileExtraction,
  ImportRef,
  IndexedSymbol,
  NestRole,
  RouteInfo,
  SymbolKind,
  SymbolRelation,
} from './types';

const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
  'Search',
]);

const VIRTUAL_PATH = '__bd_index__.ts';

/**
 * Classes whose text exceeds this many characters are split into method-level chunks (with a
 * `file > Class` breadcrumb) instead of one giant chunk — otherwise everything past the embedding
 * model's input limit would never reach the index.
 */
export const SUBCHUNK_THRESHOLD = 6000;

/** Fallback header size (lines) when a class header cannot be assembled from its members. */
const HEADER_FALLBACK_LINES = 40;

export interface TsMorphEngineOptions {
  /** Max class text length (chars) before method-level sub-chunking kicks in. */
  subchunkThreshold?: number;
}

function unquote(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/^['"`]|['"`]$/g, '');
}

function decoratorInfo(d: Decorator): DecoratorInfo {
  return { name: d.getName(), args: d.getArguments().map((a) => a.getText()) };
}

function classifyRole(
  className: string,
  decoratorNames: string[],
  implementsNames: string[],
): NestRole {
  if (decoratorNames.includes('Controller')) return 'controller';
  if (decoratorNames.includes('Module')) return 'module';
  if (decoratorNames.includes('Resolver')) return 'resolver';
  if (decoratorNames.includes('Catch')) return 'filter';
  if (implementsNames.includes('CanActivate')) return 'guard';
  if (implementsNames.includes('PipeTransform')) return 'pipe';
  if (implementsNames.includes('NestInterceptor')) return 'interceptor';
  if (implementsNames.includes('ExceptionFilter')) return 'filter';
  if (decoratorNames.includes('Injectable')) {
    return /Repository$/.test(className) ? 'repository' : 'service';
  }
  if (/Repository$/.test(className)) return 'repository';
  if (/(Dto|Request|Response)$/.test(className)) return 'dto';
  if (/Entity$/.test(className)) return 'entity';
  return 'none';
}

/** Strips generic type arguments: `Repository<User>` → `Repository`. */
function baseTypeName(text: string): string {
  const angle = text.indexOf('<');
  return (angle === -1 ? text : text.slice(0, angle)).trim();
}

export class TsMorphEngine implements AstEngine {
  private readonly project: Project;
  private readonly subchunkThreshold: number;

  constructor(options: TsMorphEngineOptions = {}) {
    this.subchunkThreshold = options.subchunkThreshold ?? SUBCHUNK_THRESHOLD;
    this.project = new Project({
      useInMemoryFileSystem: true,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: false },
    });
  }

  extract(filePath: string, content: string): FileExtraction {
    const sf = this.project.createSourceFile(VIRTUAL_PATH, content, { overwrite: true });

    const symbols: IndexedSymbol[] = [];
    const relations: SymbolRelation[] = [];
    const chunks: Chunk[] = [];

    const push = (
      kind: SymbolKind,
      name: string,
      exported: boolean,
      node: { getStartLineNumber(): number; getEndLineNumber(): number; getText(): string },
      extra?: Partial<IndexedSymbol>,
      emitChunk = true,
    ): void => {
      const startLine = node.getStartLineNumber();
      const endLine = node.getEndLineNumber();
      symbols.push({
        name,
        kind,
        nestRole: extra?.nestRole ?? 'none',
        exported,
        decorators: extra?.decorators ?? [],
        startLine,
        endLine,
        dependencies: extra?.dependencies ?? [],
        routes: extra?.routes ?? [],
      });
      if (!emitChunk) return;
      const text = node.getText();
      chunks.push({
        id: sha256(`${filePath}#${kind}:${name}:${startLine}`),
        symbol: name,
        kind,
        startLine,
        endLine,
        hash: sha256(text),
        text,
      });
    };

    for (const cls of sf.getClasses()) {
      const name = cls.getName() ?? '(anonymous)';
      const decorators = cls.getDecorators().map(decoratorInfo);
      const decoratorNames = decorators.map((d) => d.name);
      const implementsNames = cls.getImplements().map((i) => baseTypeName(i.getText()));
      const nestRole = classifyRole(name, decoratorNames, implementsNames);

      const dependencies = (cls.getConstructors()[0]?.getParameters() ?? [])
        .map((p) => baseTypeName(p.getTypeNode()?.getText() ?? ''))
        .filter((t) => t.length > 0);

      const routes = nestRole === 'controller' ? this.extractRoutes(cls) : [];

      const text = cls.getText();
      const oversized = text.length > this.subchunkThreshold;
      push(
        'class',
        name,
        cls.isExported(),
        cls,
        { nestRole, decorators, dependencies, routes },
        !oversized,
      );
      if (oversized) chunks.push(...this.subchunkClass(filePath, name, cls, text));

      for (const dep of dependencies) relations.push({ from: name, to: dep, kind: 'injects' });
      const ext = cls.getExtends();
      if (ext) relations.push({ from: name, to: baseTypeName(ext.getText()), kind: 'extends' });
      for (const impl of implementsNames) {
        relations.push({ from: name, to: impl, kind: 'implements' });
      }
    }

    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (name) push('function', name, fn.isExported(), fn);
    }
    for (const iface of sf.getInterfaces()) {
      push('interface', iface.getName(), iface.isExported(), iface);
    }
    for (const alias of sf.getTypeAliases()) {
      push('type', alias.getName(), alias.isExported(), alias);
    }
    for (const en of sf.getEnums()) {
      push('enum', en.getName(), en.isExported(), en);
    }

    const imports = this.extractImports(sf);

    return { symbols, imports, relations, chunks };
  }

  /**
   * Method-level chunks for a class too large to embed whole: one "header" chunk (class signature
   * + fields/constructor) and one chunk per method, each carrying a `file > Class` breadcrumb so
   * retrieval keeps the structural context. Chunk ids extend the regular scheme with the method
   * name (+ start line), staying deterministic and unique.
   */
  private subchunkClass(
    filePath: string,
    className: string,
    cls: ClassDeclaration,
    text: string,
  ): Chunk[] {
    const breadcrumb = `${filePath} > ${className}`;
    // The declaration line proper — getText() starts at the decorators, not at `class …`.
    const lines = text.split('\n');
    const signature = lines.find((l) => /\bclass\b/.test(l)) ?? lines[0] ?? '';
    const classStart = cls.getStartLineNumber();
    const out: Chunk[] = [];

    // Header: decorators + signature + every non-method member (fields, constructor, accessors).
    // If even that is oversized (giant literals), fall back to the first N lines of the class.
    const decoratorParts = cls.getDecorators().map((d) => d.getText());
    const memberParts = cls
      .getMembers()
      .filter((m) => m.getKind() !== SyntaxKind.MethodDeclaration)
      .map((m) => m.getText());
    let header = [...decoratorParts, signature, ...memberParts, '}'].join('\n');
    if (header.length > this.subchunkThreshold) {
      header = text.split('\n').slice(0, HEADER_FALLBACK_LINES).join('\n');
    }
    const headerText = `${breadcrumb}\n${header}`;
    out.push({
      id: sha256(`${filePath}#class:${className}:${classStart}:__header__`),
      symbol: className,
      kind: 'class',
      startLine: classStart,
      endLine: cls.getEndLineNumber(),
      hash: sha256(headerText),
      text: headerText,
    });

    for (const method of cls.getMethods()) {
      const methodName = method.getName();
      const startLine = method.getStartLineNumber();
      const chunkText = `${breadcrumb}\n${signature}\n${method.getText()}`;
      out.push({
        id: sha256(`${filePath}#class:${className}:${classStart}:${methodName}:${startLine}`),
        symbol: `${className}.${methodName}`,
        kind: 'class',
        startLine,
        endLine: method.getEndLineNumber(),
        hash: sha256(chunkText),
        text: chunkText,
      });
    }
    return out;
  }

  private extractRoutes(cls: ClassDeclaration): RouteInfo[] {
    const routes: RouteInfo[] = [];
    for (const method of cls.getMethods()) {
      for (const dec of method.getDecorators()) {
        if (!HTTP_DECORATORS.has(dec.getName())) continue;
        routes.push({
          method: dec.getName().toLowerCase(),
          path: unquote(dec.getArguments()[0]?.getText()),
          handler: method.getName(),
        });
      }
    }
    return routes;
  }

  private extractImports(sf: SourceFile): ImportRef[] {
    const imports: ImportRef[] = [];
    for (const imp of sf.getImportDeclarations()) {
      const names: string[] = [];
      const def = imp.getDefaultImport();
      if (def) names.push(def.getText());
      const ns = imp.getNamespaceImport();
      if (ns) names.push(`* as ${ns.getText()}`);
      for (const named of imp.getNamedImports()) names.push(named.getName());
      imports.push({
        module: imp.getModuleSpecifierValue(),
        names,
        typeOnly: imp.isTypeOnly(),
      });
    }
    return imports;
  }
}
