import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/decorators';
import { buildOpenApiDocument } from './openapi';

const SWAGGER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>brain-dock API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({ url: './openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`;

/** Serves the OpenAPI spec and a Swagger UI page (both public). */
@Public()
@Controller()
export class DocsController {
  @Get('openapi.json')
  spec(): Record<string, unknown> {
    return buildOpenApiDocument();
  }

  @Get('docs')
  @Header('content-type', 'text/html')
  ui(): string {
    return SWAGGER_HTML;
  }
}
