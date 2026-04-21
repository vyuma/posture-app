export type PairingInfo = {
  host: string;
  port: number;
  token: string;
};

export type PairErrorCode =
  | "INVALID_TOKEN"
  | "MISSING_TOKEN"
  | "MISSING_DEVICE_NAME"
  | "NOT_PAIRED"
  | "INTERNAL_ERROR";

export type PairResponse = {
  ok: true;
  paired: true;
  deviceName: string;
  pairedAt: string;
};

export type PollResponse =
  | {
      ok: true;
      paired: true;
      hasEvent: false;
      serverTime: string;
    };

export type ErrorResponse = {
  ok: false;
  errorCode: PairErrorCode;
  message: string;
};

export type HealthResponse = {
  ok: true;
  serverTime: string;
};
