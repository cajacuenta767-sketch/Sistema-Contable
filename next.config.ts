import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma y bcrypt son nativos: se dejan fuera del empaquetado del servidor.
  // (En Next 15 esta opcion salio de `experimental`.)
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
}

export default config
