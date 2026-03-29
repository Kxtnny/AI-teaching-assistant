"use client";
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

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
  return (

    <>
      <Card variant="outlined" sx={{
        backgroundColor: '#fafafa', minWidth: 275, transition: '0.3s',
        '&:hover': {
          boxShadow: 6,
          backgroundColor: '#ffffff',
          transform:'scale(1.02)'
        }
      }} onClick={() => console.log('Card clicked')}>
        <CardContent>
          <Typography variant="h4" component="div">
            {course.name}
          </Typography>
        </CardContent>
      </Card>
    </>
  );
}