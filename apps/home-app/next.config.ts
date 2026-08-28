import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / Cloud Run 向けに実行時必要ファイルのみを .next/standalone へ出力する
  output: "standalone",
};

export default nextConfig;
