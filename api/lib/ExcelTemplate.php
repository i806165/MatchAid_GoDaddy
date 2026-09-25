<?php
declare(strict_types=1);
// /public_html/api/lib/ExcelTemplate.php
//
// Small helpers for filling fit-for-purpose Excel templates by NAME.
// Templates address every cell through worksheet-scoped defined names, so a
// template can be restyled or rearranged in Excel without code changes.
//
// Deliberately no row insertion / copying: templates are built with a
// fixed, pre-styled capacity and the export only writes values, hides what
// it doesn't need, and sets the print area.
//
// Consumers: services/workflows/workflow_TeeSheet.php.
// (api/game_scorecard/exportPointScorecards.php still carries its own
// private copies of the name helpers; it moves here when the Scorecards
// area gets its regression pass.)

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\DefinedName;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

final class ExcelTemplate
{
  /** Find a name scoped to $sheet. Throws when the template is missing it. */
  public static function findName(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): DefinedName
  {
    foreach ($spreadsheet->getDefinedNames() as $candidate) {
      if ($candidate->getName() === $name && $candidate->getScope() === $sheet) {
        return $candidate;
      }
    }
    throw new RuntimeException("Template is missing named range {$name} on sheet " . $sheet->getTitle());
  }

  /** Address of a sheet-scoped name, without sheet prefix or "$": e.g. "A5:I8" or "B5". */
  public static function address(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): string
  {
    $value = ltrim(self::findName($spreadsheet, $sheet, $name)->getValue(), '=');
    $bang  = strrpos($value, '!');
    if ($bang !== false) $value = substr($value, $bang + 1);
    return str_replace('$', '', $value);
  }

  /**
   * Bounds of a sheet-scoped name as 1-based indexes.
   * @return array{colFrom: int, rowFrom: int, colTo: int, rowTo: int}
   */
  public static function bounds(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): array
  {
    [$from, $to] = Coordinate::rangeBoundaries(self::address($spreadsheet, $sheet, $name));
    return ['colFrom' => (int)$from[0], 'rowFrom' => (int)$from[1], 'colTo' => (int)$to[0], 'rowTo' => (int)$to[1]];
  }

  /** Read the value of a named cell (top-left cell of the name). */
  public static function getNamedValue(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): mixed
  {
    $b = self::bounds($spreadsheet, $sheet, $name);
    return $sheet->getCell([$b['colFrom'], $b['rowFrom']])->getValue();
  }

  /** Write into a named cell (top-left cell of the name). */
  public static function setNamedValue(Spreadsheet $spreadsheet, Worksheet $sheet, string $name, mixed $value): void
  {
    $b = self::bounds($spreadsheet, $sheet, $name);
    self::setValueAt($sheet, $b['colFrom'], $b['rowFrom'], $value);
  }

  /**
   * Write a value at (column index, row). Strings are written explicitly as
   * text, so "007", "1A" and "07:36 AM" are never coerced to numbers/times.
   * null / '' clears the cell.
   */
  public static function setValueAt(Worksheet $sheet, int $col, int $row, mixed $value): void
  {
    $cell = $sheet->getCell([$col, $row]);
    if ($value === null || $value === '') {
      $cell->setValue(null);
    } elseif (is_string($value)) {
      $cell->setValueExplicit($value, DataType::TYPE_STRING);
    } else {
      $cell->setValue($value);
    }
  }

  public static function hideRows(Worksheet $sheet, int $fromRow, int $toRow): void
  {
    for ($r = $fromRow; $r <= $toRow; $r++) {
      $sheet->getRowDimension($r)->setVisible(false);
    }
  }

  /** Hide every column spanned by a sheet-scoped name. */
  public static function hideNamedColumns(Spreadsheet $spreadsheet, Worksheet $sheet, string $name): void
  {
    $b = self::bounds($spreadsheet, $sheet, $name);
    for ($c = $b['colFrom']; $c <= $b['colTo']; $c++) {
      $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($c))->setVisible(false);
    }
  }

  /** Remove all borders from a block of cells (1-based column/row indexes). */
  public static function clearBorders(Worksheet $sheet, int $colFrom, int $rowFrom, int $colTo, int $rowTo): void
  {
    $range = Coordinate::stringFromColumnIndex($colFrom) . $rowFrom . ':'
           . Coordinate::stringFromColumnIndex($colTo) . $rowTo;
    $sheet->getStyle($range)->getBorders()->getAllBorders()->setBorderStyle(Border::BORDER_NONE);
  }

  /** Print area from A1 to ($lastCol, $lastRow). */
  public static function setPrintArea(Worksheet $sheet, int $lastCol, int $lastRow): void
  {
    $sheet->getPageSetup()->setPrintArea('A1:' . Coordinate::stringFromColumnIndex($lastCol) . max(1, $lastRow));
  }
}
