declare module "emusks" {
  export default class Emusks {
    user: unknown;
    auth: unknown;
    login(opts: string | Record<string, unknown>): Promise<void>;
    trends: {
      available(): Promise<unknown>;
      explore(opts?: Record<string, unknown>): Promise<unknown>;
      exploreSidebar(opts?: Record<string, unknown>): Promise<unknown>;
      exploreSettings(): Promise<unknown>;
      setExploreSettings(params?: Record<string, unknown>): Promise<unknown>;
      getById(trendId: string): Promise<unknown>;
    };
    search: {
      tweets(query: string, opts?: Record<string, unknown>): Promise<unknown>;
      latest(query: string, opts?: Record<string, unknown>): Promise<unknown>;
    };
    v2(path: string, opts?: Record<string, unknown>): Promise<{ json(): Promise<unknown> }>;
    v1_1(path: string, opts?: Record<string, unknown>): Promise<{ json(): Promise<unknown> }>;
    graphql(queryName: string, opts?: Record<string, unknown>): Promise<unknown>;
  }
}
