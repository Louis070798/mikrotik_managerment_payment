import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import OpenAPIResponseValidator from 'openapi-response-validator';

const OPENAPI_PATH = join(__dirname, '..', '..', '..', 'contracts', 'openapi.yaml');

let cachedDoc: any = null;
function loadOpenApiDoc(): any {
  if (!cachedDoc) {
    cachedDoc = yaml.load(readFileSync(OPENAPI_PATH, 'utf8'));
  }
  return cachedDoc;
}

/**
 * Validate một response THẬT (đã gọi qua app.inject()) so với contracts/openapi.yaml —
 * đây là "contract test" theo yêu cầu #13: đảm bảo response thật KHÔNG lệch khỏi những gì
 * OpenAPI công bố cho Frontend/Antigravity, theo AGENT_COLLABORATION.md §7 DoD.
 *
 * @param pathTemplate  đường dẫn dạng OpenAPI, vd '/areas/{areaId}' (KHÔNG phải path thật đã điền id)
 * @param method        'get' | 'post' | 'patch' | 'delete'
 * @param statusCode    mã HTTP thực tế nhận được
 * @param body          JSON body thực tế nhận được
 */
export function validateAgainstContract(pathTemplate: string, method: string, statusCode: number, body: unknown): void {
  const doc = loadOpenApiDoc();
  const operation = doc.paths?.[pathTemplate]?.[method.toLowerCase()];
  if (!operation) {
    throw new Error(`Contract test error: không tìm thấy ${method.toUpperCase()} ${pathTemplate} trong openapi.yaml`);
  }

  const responses: Record<string, { schema: any }> = {};
  for (const [code, respDef] of Object.entries<any>(operation.responses ?? {})) {
    const schema = respDef?.content?.['application/json']?.schema;
    if (schema) responses[code] = { schema };
  }

  const validator = new OpenAPIResponseValidator({
    responses,
    components: doc.components,
  });

  const result = validator.validateResponse(String(statusCode), body);
  if (result) {
    throw new Error(
      `Response ${method.toUpperCase()} ${pathTemplate} (${statusCode}) KHÔNG khớp contracts/openapi.yaml:\n` +
        JSON.stringify(result, null, 2) +
        `\n\nBody nhận được:\n${JSON.stringify(body, null, 2)}`,
    );
  }
}
