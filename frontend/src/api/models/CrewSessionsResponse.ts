/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { CrewSession } from './CrewSession';
import type { IdentityCapability } from './IdentityCapability';
export type CrewSessionsResponse = {
    data?: {
        username?: string;
        units?: Record<string, any>;
        source?: string;
        identity_capability?: IdentityCapability;
        sessions?: Array<CrewSession>;
    };
    meta?: BaseMeta;
    error?: any;
};

