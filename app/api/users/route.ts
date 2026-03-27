import users from '../../data/users.json';

export async function GET(request: Request) {
  const url = new URL(request.url);           
  const userId = url.searchParams.get('userId');  

  if (!userId) {
    // If no userId provided, return all users
    return new Response(JSON.stringify(users), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Filter the JSON to find the matching user
  const user = users.find(u => u.id === Number(userId));

  return new Response(JSON.stringify(user || {}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}