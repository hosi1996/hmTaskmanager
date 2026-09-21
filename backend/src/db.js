import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { config } from './config.js';

export const prisma = new PrismaClient();
export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 3 });
