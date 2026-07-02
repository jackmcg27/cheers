import { Stack } from 'expo-router';

export default function CrawlsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Crawls' }} />
      <Stack.Screen name="create" options={{ title: 'New Crawl' }} />
      <Stack.Screen name="[id]" options={{ title: 'Crawl' }} />
    </Stack>
  );
}
