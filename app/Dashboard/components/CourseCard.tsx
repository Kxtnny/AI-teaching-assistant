"use client";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

import { useRouter } from 'next/navigation'
import { usePathname } from "next/navigation";


type Course = {
  id: number;
  name: string;
}

// Define props for the component
type CourseCardProps = {
  course: Course;
  role?: string;
}

export default function CourseCard({ course, role }: CourseCardProps) {
  const router = useRouter()
  const pathname = usePathname()

  return (

    <>
      <Card variant="outlined" sx={{
        backgroundColor: '#fafafa', minWidth: 275, transition: '0.3s',
        '&:hover': {
          boxShadow: 6,
          backgroundColor: '#ffffff',
          transform: 'scale(1.02)'
        }
      }} onClick={() => router.push(`${pathname}/${course.id}`)}>
        <CardContent>
          <Typography variant="h4" component="div">
            {course.name}
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}