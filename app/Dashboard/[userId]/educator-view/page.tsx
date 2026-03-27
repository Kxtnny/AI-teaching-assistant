export default async function EducatorDashboardView({ params }: { params: Promise<{ userId: string }> }) {
    
    type User = {
        id: number;
        name: string;
    };

    const { userId } = await params;
    const res = await fetch(`http://localhost:3000/api/users?userId=${userId}`);
    const user: User = await res.json();

    return <section>{user.name}'s Educator Dashboard View</section>
}