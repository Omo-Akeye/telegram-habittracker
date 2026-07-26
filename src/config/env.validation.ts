import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // Required
  DATABASE_URL: Joi.string().uri().required(),
  BOT_TOKEN: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET must be at least 32 characters for security',
    'any.required': 'JWT_SECRET is required — tokens will be forgeable without it',
  }),

  // Optional with defaults
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  WEBHOOK_SECRET: Joi.string().optional(),
  CORS_ORIGIN: Joi.string().optional(),
});
