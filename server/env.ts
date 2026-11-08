import type { InferEnv, UnwrapConfig } from 'cf/config';
import type config from '../cloudflare.config';
type Project = UnwrapConfig<typeof config>;
export type Env = InferEnv<UnwrapConfig<Project['worker']>>;
