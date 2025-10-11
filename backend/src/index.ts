import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import askRoute from './routes/ask.js';
import timeseriesRoute from './routes/timeseries.js';
import healthRoute from './routes/health.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/ask', askRoute);
app.use('/timeseries', timeseriesRoute);
app.use('/health', healthRoute);

app.get('/', (_req, res)=> res.send('AI 경제해석관 Backend v1'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, ()=> console.log(`✅ Backend running on http://localhost:${PORT}`));
