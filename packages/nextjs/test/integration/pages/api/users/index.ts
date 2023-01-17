import { wrapApiHandlerWithSentry } from '@sentry/nextjs';
import { NextApiRequest, NextApiResponse } from 'next';

import { sampleUserData } from '../../../utils/sample-data';

const handler = async (_req: NextApiRequest, res: NextApiResponse): Promise<void> => {
  try {
    if (!Array.isArray(sampleUserData)) {
      throw new Error('Cannot find user data');
    }

    res.status(200).json(sampleUserData);
  } catch (err) {
    res.status(500).json({ statusCode: 500, message: (err as Error).message });
  }
};

export default wrapApiHandlerWithSentry(handler, '/api/users');
