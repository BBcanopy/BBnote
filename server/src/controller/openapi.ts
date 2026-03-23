export const sessionCookieSecurity = [{ sessionCookie: [] }] as const;

export const errorMessageSchema = {
  type: "object",
  properties: {
    message: { type: "string" }
  }
} as const;

export const passthroughObjectSchema = {
  type: "object",
  additionalProperties: true
} as const;

export function createUuidParamsSchema(name = "id", description = "Resource identifier") {
  return {
    type: "object",
    required: [name],
    properties: {
      [name]: {
        type: "string",
        format: "uuid",
        description
      }
    }
  } as const;
}
