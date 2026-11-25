import { z } from 'zod';

const safeToken = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(/^[^\s"]+$/, 'Must not contain spaces or double quotes');

export const createHubCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cmd'),
    hubId: z.string().trim().max(64).optional(),
    deviceId: safeToken,
    action: z.enum(['on', 'off']),
    durationS: z.coerce.number().int().min(0).max(86400).optional().default(300)
  }),
  z.object({
    type: z.literal('pair'),
    hubId: z.string().trim().max(64).optional(),
    kind: z.enum(['sensor', 'irrigation', 'actuator']),
    name: z
      .string()
      .trim()
      .min(1, 'Node name is required')
      .max(15, 'Node name must be 15 characters or less')
      .regex(/^[^\s"]+$/, 'Node name must not contain spaces or quotes'),
    seconds: z.coerce.number().int().min(5).max(600).optional().default(120)
  }),
  z.object({
    type: z.literal('cancel'),
    hubId: z.string().trim().max(64).optional()
  }),
  z.object({
    type: z.literal('cfg'),
    hubId: z.string().trim().max(64).optional(),
    deviceId: safeToken,
    intervalS: z.coerce.number().int().min(5).max(3600)
  }),
  z.object({
    type: z.literal('map'),
    hubId: z.string().trim().max(64).optional(),
    snId: safeToken,
    uuid: z
      .string()
      .trim()
      .uuid({ message: 'uuid must be a valid device UUID' })
      .transform((val) => val.toLowerCase())
  }),
  z.object({
    type: z.literal('maps'),
    hubId: z.string().trim().max(64).optional()
  })
]);

export const ackHubCommandSchema = z.object({
  status: z.enum(['executed', 'failed']),
  hubId: z.string().trim().max(64).optional(),
  resultMessage: z.string().trim().max(500).optional(),
  details: z.record(z.string(), z.any()).optional()
});

export type CreateHubCommandInput = z.infer<typeof createHubCommandSchema>;
export type AckHubCommandInput = z.infer<typeof ackHubCommandSchema>;
