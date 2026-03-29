import EducatorCourseView from "./EducatorCourseView";
import LearnerCourseView from "./LearnerCourseView";

export default async function CourseView({ params }: { params: Promise<{ userId: string; role: string }> }) {
    const { userId, role } = await params;
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
                    <h1 className="hero-title">Course Name</h1>
                </div>
            </header>

            {/* Content */}
            {role === "educator"?<EducatorCourseView/>:<LearnerCourseView/>}
        </>
    )
}