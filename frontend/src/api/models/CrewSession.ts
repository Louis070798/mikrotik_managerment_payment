/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CrewSession = {
    id?: string;
    acct_session_id?: string;
    status?: CrewSession.status;
    framed_ip?: string | null;
    calling_station_mac?: string | null;
    start_time?: string;
    stop_time?: string | null;
    last_interim_at?: string | null;
    upload_bytes?: number | null;
    download_bytes?: number | null;
    total_bytes?: number | null;
    session_time_s?: number | null;
    terminate_cause?: string | null;
};
export namespace CrewSession {
    export enum status {
        ACTIVE = 'ACTIVE',
        STALE = 'STALE',
        CLOSED = 'CLOSED',
        ORPHANED = 'ORPHANED',
    }
}

