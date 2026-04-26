package com.platform.exercise.category;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Category;
import com.platform.exercise.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public List<CategoryDto> listAll() {
        return categoryRepository.findAllWithExerciseCount().stream()
                .map(CategoryDto::from)
                .toList();
    }

    @Transactional
    public CategoryDto create(CreateCategoryRequest request) {
        Category category = new Category(request.name());
        return CategoryDto.from(categoryRepository.save(category));
    }

    @Transactional
    public void delete(Long id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.CATEGORY_NOT_FOUND));
        if (categoryRepository.countNonDeletedByCategory(id) > 0) {
            throw new PlatformException(ErrorCode.CATEGORY_HAS_EXERCISES,
                    "This category has exercises — please remove associations first");
        }
        categoryRepository.delete(category);
    }
}
