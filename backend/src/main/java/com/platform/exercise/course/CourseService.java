package com.platform.exercise.course;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Course;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;
    private final UserRepository userRepository;

    public PageResponse<CourseDto> listCourses(Long userId, int page, int size) {
        Page<CourseDto> result = courseRepository
                .findAllWithCountsByCreatedBy(userId, PageRequest.of(page, size))
                .map(CourseDto::from);
        return PageResponse.of(result);
    }

    @Transactional
    public CourseDto createCourse(CreateCourseRequest req, Long userId) {
        Course course = new Course();
        course.setName(req.name());
        course.setDescription(req.description());
        course.setCreatedBy(userId);
        Course saved = courseRepository.save(course);
        return new CourseDto(saved.getId(), saved.getName(), saved.getDescription(),
                saved.getCreatedAt(), 0L, 0L);
    }

    public CourseDto getCourse(Long courseId, Long userId) {
        Course course = findAndValidateOwnership(courseId, userId);
        // Return with zero counts from entity (detail page loads counts separately)
        return new CourseDto(course.getId(), course.getName(), course.getDescription(),
                course.getCreatedAt(), 0L, 0L);
    }

    @Transactional
    public CourseDto updateCourse(Long courseId, UpdateCourseRequest req, Long userId) {
        Course course = findAndValidateOwnership(courseId, userId);
        course.setName(req.name());
        course.setDescription(req.description());
        Course saved = courseRepository.save(course);
        return new CourseDto(saved.getId(), saved.getName(), saved.getDescription(),
                saved.getCreatedAt(), 0L, 0L);
    }

    @Transactional
    public void deleteCourse(Long courseId, Long userId) {
        Course course = findAndValidateOwnership(courseId, userId);
        course.setDeleted(true);
        courseRepository.save(course);
    }

    public List<ExerciseSummaryDto> listExercises(Long courseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findExercisesByCourse(courseId)
                .stream().map(ExerciseSummaryDto::from).toList();
    }

    @Transactional
    public LinkedResult addExercises(Long courseId, AddExercisesRequest req, Long userId) {
        findAndValidateOwnership(courseId, userId);
        int linked = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        for (Long exerciseId : req.exerciseIds()) {
            if (courseRepository.existsCourseExercise(courseId, exerciseId)) {
                skipped++;
            } else {
                courseRepository.insertCourseExercise(courseId, exerciseId);
                linked++;
            }
        }
        return new LinkedResult(linked, skipped, errors);
    }

    @Transactional
    public void removeExercise(Long courseId, Long exerciseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        if (!courseRepository.existsCourseExercise(courseId, exerciseId)) {
            throw new PlatformException(ErrorCode.EXERCISE_NOT_FOUND);
        }
        courseRepository.deleteCourseExercise(courseId, exerciseId);
    }

    public List<UserSummaryDto> listStudents(Long courseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findStudentsByCourse(courseId)
                .stream().map(UserSummaryDto::from).toList();
    }

    @Transactional
    public EnrollResult enrollStudents(Long courseId, EnrollStudentsRequest req, Long userId) {
        findAndValidateOwnership(courseId, userId);
        int enrolled = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        for (Long uid : req.userIds()) {
            var userOpt = userRepository.findById(uid);
            if (userOpt.isEmpty()) {
                skipped++;
                errors.add("User " + uid + " not found");
                continue;
            }
            User user = userOpt.get();
            if (user.getRole() != User.Role.STUDENT || user.getStatus() != User.UserStatus.ACTIVE) {
                skipped++;
                errors.add("User " + uid + " is not an active student");
                continue;
            }
            if (courseRepository.existsCourseStudent(courseId, uid)) {
                skipped++;
                continue;
            }
            courseRepository.insertCourseStudent(courseId, uid);
            enrolled++;
        }
        return new EnrollResult(enrolled, skipped, errors);
    }

    @Transactional
    public void removeStudent(Long courseId, Long studentId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        if (!courseRepository.existsCourseStudent(courseId, studentId)) {
            throw new PlatformException(ErrorCode.USER_NOT_FOUND);
        }
        courseRepository.deleteCourseStudent(courseId, studentId);
    }

    public List<UserSummaryDto> searchAvailableStudents(Long courseId, String q, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findAvailableStudents(courseId, q == null ? "" : q)
                .stream().map(UserSummaryDto::from).toList();
    }

    private Course findAndValidateOwnership(Long courseId, Long userId) {
        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.COURSE_NOT_FOUND));
        if (course.isDeleted() || !course.getCreatedBy().equals(userId)) {
            throw new PlatformException(ErrorCode.COURSE_NOT_FOUND);
        }
        return course;
    }
}
