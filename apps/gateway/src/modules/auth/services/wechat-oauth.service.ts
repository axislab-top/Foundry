import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../../common/config/config.service.js';
import { ErrorCode } from '../../../common/exceptions/error-codes.js';
import { randomBytes, createHash } from 'crypto';

/**
 * 微信用户信息接口
 */
export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
}

/**
 * 微信 Access Token 响应
 */
export interface WechatAccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信用户信息响应
 */
export interface WechatUserInfoResponse {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * 微信 OAuth 服务
 * 处理微信登录的 OAuth2 流程
 */
@Injectable()
export class WechatOAuthService {
  private readonly wechatConfig: {
    appId: string;
    appSecret: string;
    redirectUri: string;
    scope: string;
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const wechatOAuth = this.configService.getWechatOAuthConfig();
    this.wechatConfig = {
      appId: wechatOAuth.appId,
      appSecret: wechatOAuth.appSecret,
      redirectUri: wechatOAuth.redirectUri,
      scope: wechatOAuth.scope || 'snsapi_login',
    };
  }

  /**
   * 生成微信授权 URL
   * @param state 状态参数（用于防止 CSRF 攻击）
   * @returns 微信授权 URL
   */
  getAuthorizationUrl(state?: string): string {
    const stateParam = state || this.generateState();
    const params = new URLSearchParams({
      appid: this.wechatConfig.appId,
      redirect_uri: encodeURIComponent(this.wechatConfig.redirectUri),
      response_type: 'code',
      scope: this.wechatConfig.scope,
      state: stateParam,
    });

    return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
  }

  /**
   * 使用授权码换取 access_token
   * @param code 授权码
   * @returns Access Token 信息
   */
  async getAccessToken(code: string): Promise<WechatAccessTokenResponse> {
    const url = 'https://api.weixin.qq.com/sns/oauth2/access_token';
    const params = new URLSearchParams({
      appid: this.wechatConfig.appId,
      secret: this.wechatConfig.appSecret,
      code,
      grant_type: 'authorization_code',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<WechatAccessTokenResponse>(`${url}?${params.toString()}`),
      );

      const data = response.data;

      if (data.errcode) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: `微信登录失败: ${data.errmsg || '未知错误'}`,
        });
      }

      return data;
    } catch (error: any) {
      if (error.response?.data?.errcode) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: `微信登录失败: ${error.response.data.errmsg || '未知错误'}`,
        });
      }
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '获取微信访问令牌失败',
      });
    }
  }

  /**
   * 获取微信用户信息
   * @param accessToken 访问令牌
   * @param openid 用户 openid
   * @returns 微信用户信息
   */
  async getUserInfo(
    accessToken: string,
    openid: string,
  ): Promise<WechatUserInfo> {
    const url = 'https://api.weixin.qq.com/sns/userinfo';
    const params = new URLSearchParams({
      access_token: accessToken,
      openid,
      lang: 'zh_CN',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.get<WechatUserInfoResponse>(`${url}?${params.toString()}`),
      );

      const data = response.data;

      if (data.errcode) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: `获取微信用户信息失败: ${data.errmsg || '未知错误'}`,
        });
      }

      return {
        openid: data.openid,
        nickname: data.nickname,
        sex: data.sex,
        province: data.province,
        city: data.city,
        country: data.country,
        headimgurl: data.headimgurl,
        privilege: data.privilege,
        unionid: data.unionid,
      };
    } catch (error: any) {
      if (error.response?.data?.errcode) {
        throw new UnauthorizedException({
          code: ErrorCode.AUTH_LOGIN_FAILED,
          message: `获取微信用户信息失败: ${error.response.data.errmsg || '未知错误'}`,
        });
      }
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: '获取微信用户信息失败',
      });
    }
  }

  /**
   * 生成随机 state 参数
   */
  private generateState(): string {
    return createHash('sha256')
      .update(randomBytes(32))
      .digest('hex')
      .substring(0, 16);
  }
}












