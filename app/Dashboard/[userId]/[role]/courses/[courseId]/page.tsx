import EducatorCourseView from "./EducatorCourseView";
import LearnerCourseView from "./LearnerCourseView";

type Course = {
    id : number,
    name: string
}

export default async function CourseView({ params }: { params: Promise<{ userId: string; role: string; courseId: string }> }) {
    const { userId, role, courseId } = await params;
    const res = await fetch(`http://localhost:3000/api/courses?courseId=${courseId}`);
    const course:Course = await res.json()
    return (
        <>
            <header id="home" className="hero">
                <div className="hero-bg" aria-hidden="true">
                    <div className="shape shape-1" />
                    <div className="shape shape-2" />
                    <div className="shape shape-3" />
                    <div className="shape shape-4" />
                </div>

                <div className="hero-inner">
                    <h1 className="hero-title">{course.name}</h1>
                </div>
            </header>

            {/* Content */}
            {role === "educator"?<EducatorCourseView courseId={courseId}/>:<LearnerCourseView/>}
        </>
    )
}