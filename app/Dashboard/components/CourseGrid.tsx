"use client";
import Grid from "@mui/material/Grid";
import CourseCard from "./CourseCard";
import { useEffect, useState } from "react";

type Course = {
    id: number;
    name: string;
}

type AssociatedCourse = {
    userId: number;
    course: Course;
}

export default function CourseGrid({ courses, role }: { courses: AssociatedCourse[], role: string }) {

    const [isLoaded, setIsLoaded] = useState(false)

    useEffect(() => {
        setIsLoaded(true);
    }, [])

    if (!isLoaded) {
        return null
    }

    return (
        <Grid container spacing={2} >
            {courses.map((c) => (
                <Grid size={12} key={c.course.id}>
                    <CourseCard course={c.course} role={role} />
                </Grid>
            ))}
        </Grid>
    )
}