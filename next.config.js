/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from Pega server
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
