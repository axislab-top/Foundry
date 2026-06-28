/**
 * 存储适配器接口
 * 定义所有存储适配器必须实现的方法
 */
export interface IStorageAdapter {
  /**
   * 上传文件
   * @param file 文件对象（包含 buffer、mimetype、originalname 等）
   * @param path 存储路径（可选，如果不提供则自动生成）
   * @param options 上传选项
   * @returns 文件信息
   */
  upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo>;

  /**
   * 下载文件
   * @param path 文件路径
   * @returns 文件流或 Buffer
   */
  download(path: string): Promise<Buffer>;

  /**
   * 获取文件 URL（用于直接访问）
   * @param path 文件路径
   * @param expiresIn 过期时间（秒，可选）
   * @returns 文件访问 URL
   */
  getUrl(path: string, expiresIn?: number, downloadFileName?: string): Promise<string>;

  /**
   * 删除文件
   * @param path 文件路径
   * @returns 是否删除成功
   */
  delete(path: string): Promise<boolean>;

  /**
   * 检查文件是否存在
   * @param path 文件路径
   * @returns 是否存在
   */
  exists(path: string): Promise<boolean>;

  /**
   * 获取文件信息
   * @param path 文件路径
   * @returns 文件信息
   */
  getFileInfo(path: string): Promise<FileInfo>;

  /**
   * 列出文件
   * @param prefix 路径前缀
   * @param options 列表选项
   * @returns 文件列表
   */
  list(prefix?: string, options?: ListOptions): Promise<FileInfo[]>;
}

/**
 * 上传选项
 */
export interface UploadOptions {
  /**
   * 内容类型（MIME type）
   */
  contentType?: string;

  /**
   * 是否公开访问（默认 false）
   */
  public?: boolean;

  /**
   * 元数据
   */
  metadata?: Record<string, string>;

  /**
   * 访问控制列表（ACL）
   */
  acl?: string;
}

/**
 * 文件信息
 */
export interface FileInfo {
  /**
   * 文件路径（在存储中的路径）
   */
  path: string;

  /**
   * 文件名称
   */
  name: string;

  /**
   * 文件大小（字节）
   */
  size: number;

  /**
   * 内容类型（MIME type）
   */
  contentType: string;

  /**
   * 文件 URL（用于访问）
   */
  url: string;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 更新时间
   */
  updatedAt: Date;

  /**
   * 元数据
   */
  metadata?: Record<string, string>;
}

/**
 * 列表选项
 */
export interface ListOptions {
  /**
   * 最大返回数量
   */
  maxKeys?: number;

  /**
   * 起始标记（用于分页）
   */
  marker?: string;

  /**
   * 是否递归列出子目录
   */
  recursive?: boolean;
}

/**
 * 存储类型
 */
export type StorageType = 'minio' | 's3' | 'oss' | 'local';































