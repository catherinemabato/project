import { use } from 'react';
import { ClientErrorDebugTools } from '../../../../components/client-error-debug-tools';

export default function Page({ params }: any }) {
  // We need to dynamically check for this because Next.js made the API async for Next.js 15 and we use this test in canary tests
  const normalizedParams = 'then' in params ? use(params) : params;

  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/client-component/[...parameters])</h2>
      <p>Params: {JSON.stringify(normalizedParams['parameters'])}</p>
      <ClientErrorDebugTools />
    </div>
  );
}

export async function generateStaticParams() {
  return [{ parameters: ['foo', 'bar', 'baz'] }];
}
