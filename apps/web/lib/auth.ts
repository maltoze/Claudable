/**
 * 认证和配置管理模块
 * 
 * 职责：
 * 1. 处理用户认证 token 的后续流程
 * 2. 从后端 API 获取 sub_key（用于模型代理）
 * 3. 生成 Claude Code Router 配置文件
 * 4. 通过 Electron IPC 更新本地配置文件
 * 
 * 使用流程：
 * 1. 用户完成登录，获得 token
 * 2. 调用 handleTokenReceived(token) 启动自动初始化流程
 * 3. 函数依次执行：
 *    - getSubKey() 获取 sub_key
 *    - generateRouterConfig() 生成配置对象
 *    - updateRouterConfig() 更新本地配置文件
 * 
 * 集成方式：
 * 在 page.tsx 中导入使用：
 * ```tsx
 * import { handleTokenReceived } from '@/lib/auth';
 * 
 * // 在 useEffect 中监听 auth token 事件
 * electronAPI.onAuthTokenReceived((data) => {
 *   handleTokenReceived(data.token);
 * });
 * ```
 */

/**
 * 检查是否存在有效的 token
 * @returns 返回 token 如果存在，否则返回 null
 */
export async function getToken(): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.safeStorage) {
      console.warn('⚠️ Not running in Electron environment or safeStorage not available');
      return null;
    }

    const token = await (window as any).electronAPI.safeStorage.getItem('token');
    return token || null;
  } catch (error) {
    console.error('❌ Error getting token:', error);
    return null;
  }
}

/**
 * 删除存储的 token（登出）
 * @returns 返回是否成功删除
 */
export async function removeToken(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.safeStorage) {
      console.warn('⚠️ Not running in Electron environment or safeStorage not available');
      return false;
    }

    const success = await (window as any).electronAPI.safeStorage.removeItem('token');
    if (success) {
      console.log('✅ Token removed successfully');
    }
    return success;
  } catch (error) {
    console.error('❌ Error removing token:', error);
    return false;
  }
}

/**
 * 打开登录页面
 */
export async function openLoginPage(): Promise<void> {
  try {
    const loginUrl = process.env.NEXT_PUBLIC_LOGIN_BASE_URL;
    if (!loginUrl) {
      console.error('❌ NEXT_PUBLIC_LOGIN_BASE_URL not set');
      return;
    }

    const originUrl = 'claudable://app/callback';
    if (typeof window === 'undefined' || !(window as any).electronAPI?.shell?.openExternal) {
      console.warn('⚠️ Not running in Electron environment, opening in current window');
      window.location.href = loginUrl;
      return;
    }

    const loginUrlWithOrigin = `${loginUrl}${loginUrl.includes('?') ? '&' : '?'}originUrl=${encodeURIComponent(originUrl)}`;
    await (window as any).electronAPI.shell.openExternal(loginUrlWithOrigin);
  } catch (error) {
    console.error('❌ Error opening login page:', error);
  }
}

/**
 * 获取 sub_key - 用于 Claude Code Router 配置
 * @param token - 认证令牌
 * @param instanceId - 实例 ID，默认为 'clinet60165311'
 * @returns 返回 sub_key，失败时返回 null
 */
export async function getSubKey(token: string, instanceId: string = 'clinet58782459'): Promise<string | null> {
  try {
    const modelProxyBaseUrl = process.env.NEXT_PUBLIC_MODEL_PROXY_BASE_URL;
    if (!modelProxyBaseUrl) {
      console.error('❌ NEXT_PUBLIC_MODEL_PROXY_BASE_URL not set');
      return null;
    }

    const resp = await fetch(
      `${modelProxyBaseUrl}/api/key/get_or_create_sub_key`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instance_id: instanceId,
        }),
      }
    );

    if (resp.ok) {
      const data = await resp.json();
      if (data.code === 20000 && data.data?.sub_key) {
        console.log('✅ Successfully obtained sub_key');
        return data.data.sub_key;
      }
    } else {
      console.error("❌ Failed to fetch sub_key:", resp.status, await resp.text());
    }
  } catch (error) {
    console.error("❌ Error getting sub_key:", error);
  }
  return null;
}

/**
 * 生成 Claude Code Router 配置对象
 * @param subKey - API 子密钥
 * @returns 返回配置对象
 */
export function generateRouterConfig(subKey: string): object {
  const modelProxyBaseUrl = process.env.NEXT_PUBLIC_MODEL_PROXY_BASE_URL || '';
  
  return {
    LOG: false,
    LOG_LEVEL: "debug",
    CLAUDE_PATH: "",
    HOST: "127.0.0.1",
    PORT: 3456,
    APIKEY: "",
    API_TIMEOUT_MS: "600000",
    PROXY_URL: "",
    transformers: [],
    Providers: [
      {
        name: "openrouter",
        api_base_url: `${modelProxyBaseUrl}/api/proxy/chat/completions`,
        api_key: subKey,
        models: [
          "google/gemini-2.5-pro-preview",
          "anthropic/claude-sonnet-4",
          "anthropic/claude-3.5-sonnet",
          "anthropic/claude-3.7-sonnet:thinking",
          "anthropic/claude-sonnet-4.5"
        ],
        transformer: {
          use: [
            "openrouter"
          ]
        }
      }
    ],
    StatusLine: {
      enabled: false,
      currentStyle: "default",
      default: {
        modules: []
      },
      powerline: {
        modules: []
      }
    },
    Router: {
      default: "openrouter,anthropic/claude-sonnet-4",
      background: "openrouter,anthropic/claude-sonnet-4",
      think: "",
      longContext: "",
      longContextThreshold: 60000,
      webSearch: "",
      image: ""
    },
    CUSTOM_ROUTER_PATH: ""
  };
}

/**
 * 更新 Claude Code Router 配置文件
 * @param configContent - 配置文件内容
 * @returns 返回是否成功更新
 */
export async function updateRouterConfig(configContent: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !(window as any).electronAPI) {
      console.warn('⚠️ Not running in Electron environment, skipping config update');
      return false;
    }

    // 调用 Electron IPC 更新配置文件
    const result = await (window as any).electronAPI.updateConfigFile?.({
      configPath: '~/.claude-code-router/config.json',
      content: configContent
    });

    if (result?.success) {
      console.log('✅ Router config updated successfully');
      return true;
    } else {
      console.error('❌ Failed to update router config:', result?.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating router config:', error);
    return false;
  }
}

/**
 * 处理 token 获取后的初始化流程
 * 1. 从后端获取 sub_key
 * 2. 生成 Claude Code Router 配置
 * 3. 更新本地配置文件
 * @param token - 认证令牌
 */
export async function handleTokenReceived(token: string): Promise<void> {
  try {
    console.log('🔄 Processing token received...');

    // 1. 获取 sub_key
    const subKey = await getSubKey(token);
    if (!subKey) {
      console.error('❌ Failed to obtain sub_key');
      return;
    }

    // 2. 生成配置文件内容
    const config = generateRouterConfig(subKey);
    const configContent = JSON.stringify(config, null, 2);

    // 3. 更新配置文件
    const updateSuccess = await updateRouterConfig(configContent);
    if (!updateSuccess) {
      console.warn('⚠️ Could not update config file (may not be in Electron)');
    }

    console.log('✅ Token processing completed successfully');
  } catch (error) {
    console.error('❌ Error processing token:', error);
  }
}
