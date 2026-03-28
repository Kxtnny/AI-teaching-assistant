type Course = {
  id: number;
  name: string;
}

// Define props for the component
type CourseCardProps = {
  course: Course;
  role?: string;
}
export default function CourseCard({ course, role }:CourseCardProps) {
  return (
    <div className="course-card">
      <h2 className="font-bold">{course.name}</h2>

      {role === "learner" && <button>Go to Course</button>}
      {role === "educator" && <button>Manage Course</button>}
    </div>
  );
}