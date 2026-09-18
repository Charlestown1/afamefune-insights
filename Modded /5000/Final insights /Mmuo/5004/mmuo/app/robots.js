export default function robots() {
  const base = process.env.PUBLIC_URL || "https://mmuo.onrender.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin"]
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
