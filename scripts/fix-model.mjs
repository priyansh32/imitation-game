import fs from "node:fs";
let p = fs.readFileSync("src/player.ts", "utf8");
p = p
  .replace(
    "followUp: z.string().max(280).optional()",
    "followUp: z.string().max(280).nullish()"
  )
  .replace("target: z.string().optional()", "target: z.string().nullish()");
p = p.replace(
  "async model(system: string, context: unknown): Promise<unknown>",
  "async model(system: string, context: unknown, schema: unknown): Promise<unknown>"
);
p = p.replace(
  "response_format: { type: 'json_object' }",
  "response_format: { type: 'json_schema', json_schema: schema }"
);
p = p.replace(
  "const result = decisionSchema.parse(await this.model(system, { temperament: state.temperament, strategy: state.strategy, memories: state.episodes.slice(-5).map(e => e.lesson), ...observation }));\n    const eligible = observation.participants.filter(p => p.id !== observation.self && !p.eliminated);",
  "const eligible = observation.participants.filter(p => p.id !== observation.self && !p.eliminated);\n    const baseSchema = z.toJSONSchema(decisionSchema);\n    const schema = { ...baseSchema, properties: { ...baseSchema.properties, target: { type: 'string', enum: [...eligible.map(p => p.id), ...(observation.phase === 'discussion' ? [''] : [])] } }, required: ['intent', 'text', 'target', 'suspicion', 'hypothesis'] };\n    const result = decisionSchema.parse(await this.model(system, { temperament: state.temperament, strategy: state.strategy, memories: state.episodes.slice(-5).map(e => e.lesson), ...observation }, schema));"
);
p = p.replace(
  "...context }));",
  "...context }, z.toJSONSchema(reflectionSchema)));"
);
fs.writeFileSync("src/player.ts", p);
