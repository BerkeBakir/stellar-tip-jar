import WalletBar from '@/components/WalletBar';
import DonateForm from '@/components/DonateForm';
import Leaderboard from '@/components/Leaderboard';
import ActivityFeed from '@/components/ActivityFeed';
import PollProvider from '@/components/PollProvider';

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Stellar Tip Jar</h1>
        <p className="opacity-70 text-sm">
          Send a tip recorded on a Soroban contract and watch the leaderboard update live.
        </p>
      </header>
      <PollProvider />
      <WalletBar />
      <DonateForm />
      <div className="grid sm:grid-cols-2 gap-6">
        <Leaderboard />
        <ActivityFeed />
      </div>
    </main>
  );
}
