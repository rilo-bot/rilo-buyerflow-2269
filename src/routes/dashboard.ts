import { Router } from 'express';
import type { Db } from 'mongodb';
import { requireAuth } from '../middleware/auth';
import type { ApiContract } from '../contract';

type DashboardStatsResponse = ApiContract['get-dashboard-stats']['response'];

export function createDashboardRouter(db: Db): Router {
  const router = Router();

  // GET /api/dashboard/stats
  router.get('/stats', requireAuth, async (req, res) => {
    const agentId = req.agent!.agentId;
    const now = new Date().toISOString();

    try {
      const [
        activeBuyers,
        pendingOffers,
        upcomingInspections,
        openContracts,
        commissionAgg,
      ] = await Promise.all([
        // Active buyers belonging to this agent
        db.collection('buyers').countDocuments({ agentId, status: 'active' }),

        // Pending (submitted or countered) offers belonging to this agent
        db.collection('offers').countDocuments({
          agentId,
          status: { $in: ['submitted', 'countered'] },
        }),

        // Upcoming (scheduled, future) inspections belonging to this agent
        db.collection('inspections').countDocuments({
          agentId,
          status: 'scheduled',
          scheduledAt: { $gt: now },
        }),

        // Open contracts (exchanged or unconditional) belonging to this agent
        db.collection('contracts').countDocuments({
          agentId,
          status: { $in: ['exchanged', 'unconditional'] },
        }),

        // Aggregate commission totals for this agent
        db
          .collection('commissions')
          .aggregate([
            { $match: { agentId } },
            {
              $group: {
                _id: null,
                commissionExpected: { $sum: '$expectedAmount' },
                commissionReceived: { $sum: '$receivedAmount' },
              },
            },
          ])
          .toArray(),
      ]);

      const commissionExpected: number =
        commissionAgg.length > 0 ? (commissionAgg[0].commissionExpected ?? 0) : 0;
      const commissionReceived: number =
        commissionAgg.length > 0 ? (commissionAgg[0].commissionReceived ?? 0) : 0;

      const response: DashboardStatsResponse = {
        activeBuyers,
        pendingOffers,
        upcomingInspections,
        openContracts,
        commissionExpected,
        commissionReceived,
      };

      res.json(response);
    } catch (err) {
      console.error('Dashboard stats error:', err);
      res.status(500).json({ error: 'Failed to load dashboard statistics.' });
    }
  });

  return router;
}
