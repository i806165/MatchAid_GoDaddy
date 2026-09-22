<?php
declare(strict_types=1);

require_once MA_API_LIB . "/Db.php";

final class ServiceDbCourseOSM
{
    public static function getByCourseId(string $courseId): ?array
    {
        $courseId = trim($courseId);

        if ($courseId === "") {
            return null;
        }

        $pdo = Db::pdo();

        $stmt = $pdo->prepare("
            SELECT
                dbCourseOSM_CourseID,
                dbCourseOSM_FacilityName,
                dbCourseOSM_CourseName,
                dbCourseOSM_Data,
                dbCourseOSM_FetchedAt,
                _createdDate,
                _updatedDate
            FROM db_CourseOSM
            WHERE dbCourseOSM_CourseID = :courseId
            LIMIT 1
        ");

        $stmt->execute([
            ":courseId" => $courseId
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}