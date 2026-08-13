# 起势生图

一个本地可运行、也可部署到免费平台的生图网页。

支持这些能力：

- 提示词生成
- 参考图上传
- 直接从剪贴板粘贴图片
- 基于当前结果继续多轮修改
- 历史结果和提示词保存到浏览器本地
- 手机端适配

## 本地配置

`config.json`

```json
{
  "base_url": "https://lave8.com/v1",
  "image_model": "gpt-image-2"
}
```

你也可以继续使用你给的 Codex 风格配置，程序会自动读取 `[model_providers.OpenAI]` 里的 `base_url`。

`auth.json`

```json
{
  "OPENAI_API_KEY": "sk-..."
}
```

## 本地运行

```bash
npm start
```

然后打开：

```text
http://localhost:3000
```

## 安全说明

- `auth.json` 和 `config.json` 已经放进 `.vercelignore`，不会跟着部署上传。
- 部署时请把密钥填到平台环境变量里，不要写进前端代码。
- 浏览器只会请求你自己的 `/api/generate`，不会直接拿到服务端密钥。

## 免费部署

当前项目已经按 Vercel 的免费方案做了部署结构：

- 静态页面：`public/`
- 服务端接口：`api/config.js`、`api/generate.js`

部署时只需要配置环境变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL=https://lave8.com/v1`
- `IMAGE_MODEL=gpt-image-2`
