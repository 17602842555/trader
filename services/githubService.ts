
import { AssetHistory } from '../types';

const GIST_FILENAME = 'okx_trader_history.json';
const GIST_DESCRIPTION = 'OKX Trader Pro - Asset History Sync Data';

export class GitHubService {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request(path: string, options: RequestInit = {}) {
    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Invalid GitHub Token");
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Find existing gist for this app
   */
  private async findGist(): Promise<string | null> {
    try {
      // Get user's gists
      const gists = await this.request('/gists');
      const target = gists.find((g: any) => 
        g.description === GIST_DESCRIPTION && g.files[GIST_FILENAME]
      );
      return target ? target.id : null;
    } catch (e) {
      console.warn("Failed to find gist", e);
      return null;
    }
  }

  /**
   * Create a new gist with current data
   */
  private async createGist(data: AssetHistory[]): Promise<string> {
    const body = {
      description: GIST_DESCRIPTION,
      public: false, // Private Gist
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    };

    const res = await this.request('/gists', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return res.id;
  }

  /**
   * Update existing gist
   */
  private async updateGist(gistId: string, data: AssetHistory[]) {
    const body = {
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    };

    await this.request(`/gists/${gistId}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  }

  /**
   * Sync logic: Download remote -> Merge with local -> Upload result
   */
  public async syncData(localData: AssetHistory[]): Promise<AssetHistory[]> {
    if (!this.token) return localData;

    try {
      let gistId = await this.findGist();
      let remoteData: AssetHistory[] = [];

      if (gistId) {
        // Fetch remote content
        const gist = await this.request(`/gists/${gistId}`);
        const file = gist.files[GIST_FILENAME];
        if (file && file.content) {
            try {
                remoteData = JSON.parse(file.content);
            } catch (e) {
                console.error("Failed to parse Gist content", e);
            }
        }
      }

      // Merge Logic: Combine maps by timestamp to ensure uniqueness
      const mergedMap = new Map<string, AssetHistory>();
      
      // Add remote first
      remoteData.forEach(item => mergedMap.set(item.ts, item));
      // Add local (overwrites remote if conflict, prioritizing latest local state, or vice versa depending on strategy. 
      // Since history is immutable per timestamp usually, simple union is fine.
      localData.forEach(item => mergedMap.set(item.ts, item));

      // Convert back to array and sort
      const mergedList = Array.from(mergedMap.values())
        .sort((a, b) => parseInt(a.ts) - parseInt(b.ts));

      // If we found a gist, update it. If not, create one.
      if (gistId) {
        // Only update if remote count is different (naive check) or if we have new local data
        if (mergedList.length !== remoteData.length) {
            await this.updateGist(gistId, mergedList);
        }
      } else {
        await this.createGist(mergedList);
      }

      return mergedList;
    } catch (e) {
      console.error("GitHub Sync Failed", e);
      throw e;
    }
  }
}
