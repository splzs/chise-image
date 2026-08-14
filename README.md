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
  "base_url": "",
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
