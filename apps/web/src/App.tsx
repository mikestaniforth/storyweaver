import { useEffect, useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { GameScreen } from './components/GameScreen';
import { ApiClient } from './lib/api';
import { useAuth } from './lib/auth';

export function App() {
  const { session, loading, signOut, getToken } = useAuth();
  const api = useMemo(() => new ApiClient(getToken), [getToken]);
  const [campaignId, setCampaignId] = useState<string | null>(() => campaignIdFromPath());

  useEffect(() => {
    const onHistoryChange = () => setCampaignId(campaignIdFromPath());
    window.addEventListener('popstate', onHistoryChange);
    return () => window.removeEventListener('popstate', onHistoryChange);
  }, []);

  function openCampaign(id: string) {
    window.history.pushState({}, '', `/campaign/${encodeURIComponent(id)}`);
    setCampaignId(id);
  }

  function closeCampaign() {
    window.history.pushState({}, '', '/');
    setCampaignId(null);
  }

  async function leave() {
    window.history.replaceState({}, '', '/');
    setCampaignId(null);
    await signOut();
  }

  if (loading)
    return (
      <main className="app-loading">
        <span>✦</span>
        <p>Finding your storybook…</p>
      </main>
    );
  if (!session) return <AuthScreen />;
  if (campaignId)
    return (
      <GameScreen session={session} api={api} campaignId={campaignId} onBack={closeCampaign} />
    );
  return <Dashboard session={session} api={api} onOpenCampaign={openCampaign} onSignOut={leave} />;
}

function campaignIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/campaign\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
