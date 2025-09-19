const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

async function main() {
  const passwordAdmin = await bcrypt.hash('admin123', 10)
  const passwordPeminjam = await bcrypt.hash('peminjam123', 10)

  await prisma.user.upsert({
    where: { email: 'admin@umc.ac.id' },
    update: {},
    create: {
      name: 'Admin Sistem',
      email: 'admin@umc.ac.id',
      phone: '081234567890',
      passwordHash: passwordAdmin,
      role: 'ADMIN',
      status: 'AKTIF',
    },
  })

  await prisma.user.upsert({
    where: { email: 'user1@umc.ac.id' },
    update: {},
    create: {
      name: 'User Peminjam',
      email: 'user1@umc.ac.id',
      phone: '089876543210',
      passwordHash: passwordPeminjam,
      role: 'PEMINJAM',
      status: 'AKTIF',
    },
  })

  console.log('✅ Seeder berhasil dijalankan!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
