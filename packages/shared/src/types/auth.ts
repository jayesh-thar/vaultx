export interface AuthResponse {
  accessToken: string;
  userId: string;
}

export interface LoginResponse extends AuthResponse {
  kdfSalt: string;
  kdfParams: KdfParams;
  vaultKeyEnc: string;
  vaultKeyIv: string;
}

export interface KdfParams {
  memory: number;
  iterations: number;
  parallelism: number;
}

export interface RegisterInput {
  email: string;
  authKey: string;
  authSalt: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  vaultKeyEnc: string;
  vaultKeyIv: string;
}

export interface LoginInput {
  email: string;
  authKey: string;
}
