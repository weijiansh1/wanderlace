/**
 * API拦截器
 * 用于处理请求和响应的拦截逻辑
 */

import { request } from './client';

// 请求拦截器
export interface RequestInterceptor {
  onRequest?: (url: string, options: RequestInit) => RequestInit;
  onRequestError?: (error: Error) => Promise<Error>;
}

// 响应拦截器
export interface ResponseInterceptor {
  onResponse?: <T>(response: T, url: string) => T;
  onResponseError?: (error: Error) => Promise<Error>;
}

// 拦截器集合
class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  // 添加请求拦截器
  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor);
  }

  // 添加响应拦截器
  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor);
  }

  // 执行请求拦截
  async executeRequestInterceptors(url: string, options: RequestInit): Promise<RequestInit> {
    let modifiedOptions = { ...options };
    
    for (const interceptor of this.requestInterceptors) {
      if (interceptor.onRequest) {
        try {
          modifiedOptions = interceptor.onRequest(url, modifiedOptions);
        } catch (error) {
          if (interceptor.onRequestError) {
            await interceptor.onRequestError(error as Error);
          } else {
            throw error;
          }
        }
      }
    }
    
    return modifiedOptions;
  }

  // 执行响应拦截
  async executeResponseInterceptors<T>(response: T, url: string): Promise<T> {
    let modifiedResponse = response;
    
    for (const interceptor of this.responseInterceptors) {
      if (interceptor.onResponse) {
        try {
          modifiedResponse = interceptor.onResponse(modifiedResponse, url);
        } catch (error) {
          if (interceptor.onResponseError) {
            await interceptor.onResponseError(error as Error);
          } else {
            throw error;
          }
        }
      }
    }
    
    return modifiedResponse;
  }
}

// 创建拦截器管理器实例
export const interceptorManager = new InterceptorManager();

// 带拦截器的请求函数
export async function requestWithInterceptors<T>(path: string, options: RequestInit = {}): Promise<T> {
  // 执行请求拦截
  const interceptedOptions = await interceptorManager.executeRequestInterceptors(path, options);
  
  try {
    // 执行请求
    const response = await request<T>(path, interceptedOptions);
    
    // 执行响应拦截
    const interceptedResponse = await interceptorManager.executeResponseInterceptors<T>(response, path);
    
    return interceptedResponse;
  } catch (error) {
    // 执行响应错误拦截
    let errorToThrow = error as Error;
    for (const interceptor of interceptorManager.responseInterceptors) {
      if (interceptor.onResponseError) {
        try {
          errorToThrow = await interceptor.onResponseError(errorToThrow);
        } catch (interceptorError) {
          // 如果拦截器本身出错，继续抛出原始错误
          throw errorToThrow;
        }
      }
    }
    
    throw errorToThrow;
  }
}

// 默认导出
export default interceptorManager;

// 常用拦截器实现

// 认证拦截器
export const authInterceptor: RequestInterceptor = {
  onRequest: (url, options) => {
    // 从localStorage或store中获取token
    const token = localStorage.getItem('access_token');
    
    if (token) {
      return {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${token}`,
        }
      };
    }
    
    return options;
  }
};

// 日志拦截器
export const loggingInterceptor: RequestInterceptor & ResponseInterceptor = {
  onRequest: (url, options) => {
    console.log(`[API] Request: ${url}`, options);
    return options;
  },
  onResponse: (response, url) => {
    console.log(`[API] Response: ${url}`, response);
    return response;
  },
  onRequestError: async (error) => {
    console.error('[API] Request Error:', error);
    return error;
  },
  onResponseError: async (error) => {
    console.error('[API] Response Error:', error);
    return error;
  }
};

// 错误处理拦截器
export const errorHandlingInterceptor: ResponseInterceptor = {
  onResponseError: async (error) => {
    if (error instanceof Error) {
      // 特定错误处理
      if (error.message.includes('401')) {
        // 处理未授权错误，比如跳转到登录页
        console.warn('Unauthorized, redirecting to login...');
        // 可以在这里触发登出逻辑
      } else if (error.message.includes('403')) {
        console.warn('Forbidden access');
      } else if (error.message.includes('500')) {
        console.error('Internal server error');
      }
    }
    return error;
  }
};

// 添加默认拦截器
interceptorManager.addRequestInterceptor(authInterceptor);
interceptorManager.addRequestInterceptor(loggingInterceptor);
interceptorManager.addResponseInterceptor(errorHandlingInterceptor);