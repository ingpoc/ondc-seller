import { AgentChat, PageLayout, PageHeader } from '@portfolio-ui';

export function AgentChatPage(): React.ReactElement {
  return (
    <PageLayout>
      <PageHeader
        title="Seller Agent Assistant"
        subtitle="Chat with the AI agent to manage your catalog, optimize listings, and analyze pricing."
      />
      <AgentChat
        endpoint="/api/agent/seller"
        title="Seller Agent"
        placeholder="e.g., Add a new product to my catalog"
      />
    </PageLayout>
  );
}
