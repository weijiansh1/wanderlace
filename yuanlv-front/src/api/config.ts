// API配置文件
const API_CONFIG = {
  // 开发环境配置
  development: {
    BASE_URL: 'http://localhost:8000',
  },
  
  // 生产环境配置
  production: {
    BASE_URL: 'https://your-production-domain.com', // 替换为实际的生产域名
  },
  
  // 测试环境配置
  test: {
    BASE_URL: 'http://localhost:8000',
  },
};

// 获取当前环境
const getEnvironment = (): keyof typeof API_CONFIG => {
  // 可以通过环境变量或其他方式判断当前环境
  // 默认为development
  return (process.env.NODE_ENV as keyof typeof API_CONFIG) || 'development';
};

export const API_BASE_URL = API_CONFIG[getEnvironment()].BASE_URL;