import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { paymentRoutes } from './routes/paymentRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Main Routes
app.use('/v1', paymentRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', service: 'SOLQ Orchestrator' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

