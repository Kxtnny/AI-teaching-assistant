export default async function LearnerDashboardView({ params }: { params: Promise<{ userId: string; role: string }> }) {
    type User = {
        id: number;
        name: string;
    }

    type AssociatedCourse = {
        userId: number;
        courseId: number;
    }

    const { userId, role } = await params;
    const res = await fetch(`http://localhost:3000/api/users?userId=${userId}`);
    const user: User = await res.json()

    let courses: AssociatedCourse[] = []
    if (role === "learner") {
        const res = await fetch(`http://localhost:3000/api/courses-registered?userId=${userId}`);
        const associatedCourse: AssociatedCourse[] = await res.json()
        courses = associatedCourse
    }
    else if (role === "educator") {
        const res = await fetch(`http://localhost:3000/api/course-instructors?userId=${userId}`);
        const associatedCourse: AssociatedCourse[] = await res.json()
        courses = associatedCourse
    }

    return (
        <>
            {/* HERO */}
            <header id="home" className="hero">
                <div className="hero-bg" aria-hidden="true">
                    <div className="shape shape-1" />
                    <div className="shape shape-2" />
                    <div className="shape shape-3" />
                    <div className="shape shape-4" />
                </div>

                <div className="hero-inner">
                    <h1 className="hero-title">{user.name}'s {role} page</h1>
                </div>
            </header>

            {/* COURSE CARDS */}
            <section className="section split">

            </section>
            <section className="section split">
                <div className="split-inner">
                    <div>
                        <h1 className="section-title">COURSES</h1>
                    </div>
                    <div>
                        <ul>
                            {courses.map((course: AssociatedCourse) => (
                                <li key={course.courseId}>
                                    Course ID: {course.courseId}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>
        </>
    )

}