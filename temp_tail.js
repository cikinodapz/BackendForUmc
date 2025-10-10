// List all payments (Admin: semua, User: miliknya)
const listPayments = async (req, res) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({ message: "User tidak terautentikasi" });
    }

    const isAdmin = role === 'ADMIN';

    const payments = await prisma.payment.findMany({
      where: isAdmin ? {} : { booking: { userId } },
      include: {
        booking: {
          select: {
            id: true,
            userId: true,
            startDate: true,
            endDate: true,
            status: true,
            totalAmount: true,
            user: { select: { id: true, name: true, email: true } },
            items: {
              select: {
                id: true,
                type: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
                service: { select: { id: true, name: true, photoUrl: true } },
                package: { select: { id: true, name: true } },
                asset: { select: { id: true, name: true, photoUrl: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(payments);
  } catch (error) {
    console.error("List payments error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
};

module.exports = {
  createPayment,
  getPaymentDetails,
  handleMidtransNotification,
  checkPaymentStatus,
  listPayments,
};
