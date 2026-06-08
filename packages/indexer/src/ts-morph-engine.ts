import { type ClassDeclaration, type Decorator, Project, type SourceFile } from 'ts-morph';
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

  constructor() {
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

      push('class', name, cls.isExported(), cls, {
        nestRole,
        decorators,
        dependencies,
        routes,
      });

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
