# Сборка итогового DOCX-отчёта «Великая Отечественная война в моей семье».
# Запуск: powershell -ExecutionPolicy Bypass -File tools\build-report-docx.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$docsDir = Join-Path $root "docs"
$buildDir = Join-Path $env:TEMP ("pamyat-roda-docx-" + [Guid]::NewGuid().ToString("N"))
$outputFile = Join-Path $docsDir "Великая_Отечественная_война_в_моей_семье.docx"

function Esc([string]$text) {
  if ($null -eq $text) { return "" }
  return [System.Security.SecurityElement]::Escape($text)
}

$script:paras = New-Object System.Collections.Generic.List[string]

function Get-PPr([string]$style) {
  switch ($style) {
    "title"     { return '<w:pPr><w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    "subtitle"  { return '<w:pPr><w:spacing w:before="0" w:after="160" w:line="300" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    "meta"      { return '<w:pPr><w:spacing w:before="0" w:after="80" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    "small"     { return '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    "star"      { return '<w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    "spacer"    { return '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' }
    "h1"        { return '<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="280" w:line="300" w:lineRule="auto"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>' }
    "h2"        { return '<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120" w:line="280" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr>' }
    "h3"        { return '<w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80" w:line="260" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr>' }
    "bullet"    { return '<w:pPr><w:spacing w:before="0" w:after="60" w:line="340" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/><w:jc w:val="both"/></w:pPr>' }
    "quote"     { return '<w:pPr><w:spacing w:before="120" w:after="160" w:line="340" w:lineRule="auto"/><w:ind w:left="700" w:right="500"/><w:jc w:val="both"/></w:pPr>' }
    "toc"       { return '<w:pPr><w:spacing w:before="0" w:after="90" w:line="260" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' }
    "tocSub"    { return '<w:pPr><w:spacing w:before="0" w:after="60" w:line="250" w:lineRule="auto"/><w:ind w:left="420"/><w:jc w:val="left"/></w:pPr>' }
    "caption"   { return '<w:pPr><w:spacing w:before="200" w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' }
    default     { return '<w:pPr><w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr>' }
  }
}

function Get-RPr([string]$style) {
  switch ($style) {
    "title"    { return '<w:rPr><w:b/><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="18201D"/></w:rPr>' }
    "subtitle" { return '<w:rPr><w:i/><w:sz w:val="30"/><w:szCs w:val="30"/><w:color w:val="4D544E"/></w:rPr>' }
    "meta"     { return '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="7B8078"/></w:rPr>' }
    "small"    { return '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr>' }
    "star"     { return '<w:rPr><w:sz w:val="48"/><w:szCs w:val="48"/><w:color w:val="B4883F"/></w:rPr>' }
    "h1"       { return '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="18201D"/></w:rPr>' }
    "h2"       { return '<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="18201D"/></w:rPr>' }
    "h3"       { return '<w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="18201D"/></w:rPr>' }
    "quote"    { return '<w:rPr><w:i/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="3E463F"/></w:rPr>' }
    "toc"      { return '<w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>' }
    "tocSub"   { return '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="4D544E"/></w:rPr>' }
    "caption"  { return '<w:rPr><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="7B8078"/></w:rPr>' }
    default    { return '<w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>' }
  }
}

function Add-Para {
  param(
    [string]$Text = "",
    [string]$Style = "body"
  )
  $pPr = Get-PPr $Style
  $rPr = Get-RPr $Style
  if ([string]::IsNullOrEmpty($Text)) {
    $run = ""
  } else {
    $run = '<w:r>' + $rPr + '<w:t xml:space="preserve">' + (Esc $Text) + '</w:t></w:r>'
  }
  $script:paras.Add('<w:p>' + $pPr + $run + '</w:p>')
}

function Add-PageBreak {
  $script:paras.Add('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
}

function Add-Rule {
  $script:paras.Add('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="B4883F"/></w:pBdr><w:spacing w:before="0" w:after="280"/></w:pPr></w:p>')
}

function Add-TocItem {
  param([string]$Text, [switch]$Sub)
  if ($Sub) { Add-Para $Text "tocSub" } else { Add-Para $Text "toc" }
}

function Add-Table {
  param([object[]]$Rows)

  $widths = @(1250, 4052, 4052)
  $xml = New-Object System.Text.StringBuilder
  [void]$xml.Append('<w:tbl>')
  [void]$xml.Append('<w:tblPr><w:tblW w:w="9354" w:type="dxa"/>')
  [void]$xml.Append('<w:tblBorders>')
  [void]$xml.Append('<w:top w:val="single" w:sz="6" w:space="0" w:color="B8B2A6"/>')
  [void]$xml.Append('<w:left w:val="single" w:sz="6" w:space="0" w:color="B8B2A6"/>')
  [void]$xml.Append('<w:bottom w:val="single" w:sz="6" w:space="0" w:color="B8B2A6"/>')
  [void]$xml.Append('<w:right w:val="single" w:sz="6" w:space="0" w:color="B8B2A6"/>')
  [void]$xml.Append('<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D8D2C6"/>')
  [void]$xml.Append('<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D8D2C6"/>')
  [void]$xml.Append('</w:tblBorders>')
  [void]$xml.Append('<w:tblLayout w:type="fixed"/>')
  [void]$xml.Append('<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>')
  [void]$xml.Append('</w:tblPr>')
  [void]$xml.Append('<w:tblGrid>')
  foreach ($w in $widths) { [void]$xml.Append('<w:gridCol w:w="' + $w + '"/>') }
  [void]$xml.Append('</w:tblGrid>')

  for ($r = 0; $r -lt $Rows.Count; $r++) {
    $row = $Rows[$r]
    [void]$xml.Append('<w:tr><w:trPr><w:cantSplit/></w:trPr>')
    for ($c = 0; $c -lt $row.Count; $c++) {
      $cell = [string]$row[$c]
      [void]$xml.Append('<w:tc><w:tcPr><w:tcW w:w="' + $widths[$c] + '" w:type="dxa"/>')
      if ($r -eq 0) {
        [void]$xml.Append('<w:shd w:val="clear" w:color="auto" w:fill="F2EBDF"/>')
      }
      [void]$xml.Append('</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>')
      $runProps = if ($r -eq 0) { '<w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' } else { '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' }
      [void]$xml.Append('<w:r>' + $runProps + '<w:t xml:space="preserve">' + (Esc $cell) + '</w:t></w:r>')
      [void]$xml.Append('</w:p></w:tc>')
    }
    [void]$xml.Append('</w:tr>')
  }

  [void]$xml.Append('</w:tbl>')
  $script:paras.Add($xml.ToString())
  # Пустой абзац после таблицы — иначе Word может «прилипать» к следующему тексту.
  $script:paras.Add('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>')
}

# ---------------------------------------------------------------------------
# Титульный лист
# ---------------------------------------------------------------------------

Add-Para "СЕМЕЙНЫЙ АРХИВ · ПАМЯТЬ РОДА" "small"
Add-Para "" "spacer"
Add-Para "" "spacer"
Add-Para "★" "star"
Add-Para "" "spacer"
Add-Para "ИССЛЕДОВАТЕЛЬСКИЙ ПРОЕКТ" "meta"
Add-Para "ВЕЛИКАЯ ОТЕЧЕСТВЕННАЯ ВОЙНА В МОЕЙ СЕМЬЕ" "title"
Add-Rule
Add-Para "Боевой путь Ивана Илларионовича Филонова и Ефима Исаковича Подгорбунских" "subtitle"
Add-Para "Материалы семейного архива Филоновых — Подгорбунских" "meta"
Add-Para "" "spacer"
Add-Para "" "spacer"
Add-Para "" "spacer"
Add-Para "" "spacer"
Add-Para "Семейный архив · 2026" "meta"
Add-Para "Документ сформирован сервисом «Память рода»" "small"
Add-PageBreak

# ---------------------------------------------------------------------------
# Содержание
# ---------------------------------------------------------------------------

Add-Para "СОДЕРЖАНИЕ" "h1"
Add-Para "" "spacer"
Add-TocItem "1. Введение"
Add-TocItem "1.1 Актуальность темы" -Sub
Add-TocItem "1.2 Цели и задачи" -Sub
Add-TocItem "1.3 План работы над проектом" -Sub
Add-TocItem "1.4 Как мы искали" -Sub
Add-TocItem "2. Великая Отечественная война в моей семье"
Add-TocItem "2.1 Предвоенная биография прадедов" -Sub
Add-TocItem "2.2 Боевой путь Филонова И. И." -Sub
Add-TocItem "2.3 Боевой путь Подгорбунских Е. И." -Sub
Add-TocItem "2.4 Жизнь после войны" -Sub
Add-TocItem "3. Заключение"
Add-TocItem "4. Список использованной литературы и источников"
Add-TocItem "Приложение. Хроника боевого пути"
Add-PageBreak

# ---------------------------------------------------------------------------
# 1. Введение
# ---------------------------------------------------------------------------

Add-Para "1. ВВЕДЕНИЕ" "h1"
Add-Para "1.1 Актуальность темы" "h2"
Add-Para "В живых участников Великой Отечественной войны почти не осталось. Своих прадедов мне не довелось увидеть. О них я знаю по рассказам дедушки, бабушки и по документам, сохранившимся в семейном архиве. В нашей семье чтят память ветеранов. Мы должны знать и помнить людей, которые подарили нам мирную жизнь, и передавать эту память будущим поколениям."
Add-Para "История страны складывается из историй семей. За двумя фамилиями в этом исследовании — два разных жизненных пути. Иван Илларионович Филонов ушёл на фронт восемнадцатилетним лейтенантом, а Ефим Исакович Подгорбунских был призван в пятьдесят лет, уже пройдя Первую мировую и Гражданскую войны. Оба они защищали Родину и оба вернулись домой."

Add-Para "1.2 Цели и задачи" "h2"
Add-Para "Цели и задачи моего проекта:"
Add-Para "— ещё раз обратиться к истории Великой Отечественной войны через участие в ней моих прадедов;" "bullet"
Add-Para "— собрать сведения об участии прадедов в боевых действиях;" "bullet"
Add-Para "— проанализировать материалы литературных источников и интернет-ресурсов о сражениях, в которых принимали участие мои близкие;" "bullet"
Add-Para "— дополнить информацией страницы о моих прадедах на сайте «Бессмертный полк» (moypolk.ru);" "bullet"
Add-Para "— сохранить собранные материалы в семейном архиве и оформить их в виде исследования." "bullet"

Add-Para "1.3 План работы над проектом" "h2"
Add-Para "Подготовить проект мне помогали дедушка Подгорбунских Павел Ефимович и бабушка Подгорбунских (Филонова) Людмила Ивановна. Вместе с ними я попыталась отследить боевой путь моих прадедов. Для этого мы нашли документы Генерального штаба Вооружённых Сил СССР, справочники по Великой Отечественной войне, воспоминания участников тех событий и газеты военных лет."
Add-Para "Работа шла постепенно: от семейных рассказов — к архивам, от архивных документов — к хронике боевого пути. Каждый найденный документ проверялся и сопоставлялся с уже известными сведениями."

Add-Para "1.4 Как мы искали" "h2"
Add-Para "Работа началась с семейных воспоминаний. Затем мы искали фамилии в открытых банках документов: «Память народа», ОБД «Мемориал», «Подвиг народа». Найденные записи — наградные листы, сведения о боевом пути, документы о ранениях — сверяли с рассказами родных."
Add-Para "Чтобы ничего не потерялось, я собрала находки в сервисе «Память рода». Он помогает искать по фамилии, фронту, наградам и местам сражений, а затем формирует семейный отчёт. Этот документ — результат такой работы. Его можно дополнять по мере появления новых документов."

Add-PageBreak

# ---------------------------------------------------------------------------
# 2. Основная часть
# ---------------------------------------------------------------------------

Add-Para "2. ВЕЛИКАЯ ОТЕЧЕСТВЕННАЯ ВОЙНА В МОЕЙ СЕМЬЕ" "h1"

Add-Para "2.1 Предвоенная биография прадедов" "h2"
Add-Para "Мои прадедушки родились в разное время и в разных местах. Подгорбунских Ефим Исакович родился в 1892 году в большой крестьянской семье в селе Введенское Челябинского уезда Оренбургской губернии. Прадедушка Филонов Иван Илларионович родился в 1923 году в селе Ново-Тарасовичи Белорусской ССР, тоже в большой семье. Позднее его семья переехала в Челябинскую область."
Add-Para "Прадедушка Ефим в 1913 году был призван на службу в царскую армию. Его направили в Челябинск в учебную команду, после окончания которой он служил унтер-офицером и был оставлен здесь. В 1916 году был направлен на фронт, воевал в Первой мировой войне. Потом попал в пекло Гражданской войны, закончил её в составе Красной армии в 1922 году, крестьянствовал, работал в совхозах."
Add-Para "А прадедушка Иван родился только через год после этих событий. Однако когда началась Великая Отечественная война, оба прадедушки встали на защиту своей страны."

Add-Para "2.2 Боевой путь Филонова И. И." "h2"
Add-Para "Из рассказов дедушки, бабушки и различных документов я узнала, что первым из двух прадедов на фронт попал прадед Иван. Как и многие, он пошёл добровольцем. В 1941 году его направили в Камышловское пехотное училище в Свердловской области. После ускоренного выпуска восемнадцатилетним лейтенантом он был направлен в Северное Заполярье, на Карельский фронт. Отсюда начался боевой путь моего прадеда Ивана."
Add-Para "По наградным документам прадеда Ивана мы узнали, что он воевал в 152-й стрелковой дивизии 646-го стрелкового полка. Из справочника Генерального штаба ВС СССР известно, что формироваться эта дивизия начала в декабре 1941 года в городе Красноуфимске Свердловской области как 430-я стрелковая дивизия, а в январе 1942 года была переименована в 152-ю стрелковую дивизию и направлена в распоряжение командующего Карельским фронтом."
Add-Para "Карельский фронт был призван помешать врагу проникнуть в Заполярье, не дать захватить незамерзающий Мурманск, защищать Кировскую железную дорогу, так как это был единственный путь, через который шла помощь союзников."

Add-Para "Северное Заполярье" "h3"
Add-Para "Бабушка помнит, как её папа упоминал про бои под Мурманском, про цингу, про бездорожье. Для доставки питания и боеприпасов использовались оленьи и собачьи упряжки. Рассказывал он немного: о войне говорить не любил, видимо, слишком тяжёлые были воспоминания. Поэтому события того времени мы частично постарались восстановить по разным документам."
Add-Para "Мурманск более сорока месяцев сдерживал натиск врага с суши и воздуха. Освобождение Заполярья вошло в список четырнадцати наиболее крупных сражений Великой Отечественной войны. На главном Параде Победы сводный полк Карельского фронта шёл первым. С тех пор традиционно на парадах 9 Мая знамя Карельского фронта несут первым среди знамён фронтов."
Add-Para "За участие в боях за Мурманск прадед Иван получил свою первую награду — медаль «За оборону Советского Заполярья»."

Add-Para "Юго-Западный фронт и Курская дуга" "h3"
Add-Para "После проведения нескольких важных операций в районе Мурманска 152-я стрелковая дивизия была переброшена на Юго-Западный фронт, в район Купянска."
Add-Para "Юго-Западный фронт второго формирования был создан в октябре 1942 года. 152-я стрелковая дивизия, в которой воевал мой прадед, вошла в состав 6-й армии этого фронта в феврале 1943 года. Харьковская операция началась 2 февраля. В этот же день перешла в наступление и 6-я армия Ф. М. Харитонова, имевшая задачу ударом на Купянск, Балаклею, Змиев обеспечить левое крыло Воронежского фронта."
Add-Para "Как пишет в своих воспоминаниях маршал А. М. Василевский, наступление развёртывалось успешно. Освободили Белгород, Курск, вели напряжённые бои за Харьков, и в середине февраля удалось овладеть им. Но обстановка быстро менялась. Немцы яростно сопротивлялись, пытались задержаться на оборонительных рубежах, предприняли контрнаступление и вновь вернули себе Белгород и Харьков. Курск удалось отстоять."
Add-Para "Образовался знаменитый Курский выступ — Курская дуга, где в июле — августе 1943 года состоялось величайшее сражение, которое после Сталинграда окончательно повернуло ход войны. Как пишут историки, с обеих сторон в битве участвовало свыше двух миллионов человек, около шести тысяч танков, четыре тысячи самолётов."

Add-Para "Ранение" "h3"
Add-Para "На последней стадии битвы, за четыре дня до освобождения Харькова, мой прадед получил тяжёлое ранение. Он был отправлен в тыловой госпиталь в город Горький (ныне Нижний Новгород), где проходил длительное лечение. Впоследствии был ограниченно годен второй степени, долгое время ходил с тросточкой. За бои под Харьковом прадед был награждён медалью «За отвагу»."

Add-Para "2.3 Боевой путь Подгорбунских Е. И." "h2"
Add-Para "В августе 1942 года прадед Ефим был призван в армию в числе последних возрастов — на тот момент ему было 50 лет. После краткосрочной подготовки в Чебаркуле был отправлен на фронт под Ленинград. По документам мы узнали, что он воевал в звукометрической разведке 116-го корпусного пушечно-артиллерийского полка 43-го стрелкового корпуса Ленинградского фронта. Корпус был в разных армиях. Судя по исторической хронологии, основное время он был в составе 2-й ударной армии."
Add-Para "История 2-й ударной армии была трагична: окружение, гибель большей части состава, предательство командующего армией генерала А. А. Власова. Об этом много писали историки. Но всё это случилось до того, как мой прадед попал во 2-ю ударную армию. В это время армией командовал прославленный генерал И. И. Федюнинский. Уже в новой 2-й ударной армии прадед участвовал в боях до полного снятия блокады Ленинграда."
Add-Para "Прадед Ефим, как вспоминает мой дедушка, со слезами на глазах слушал по радио о Ленинградской блокаде, о боях на Синявинских высотах, о боях под Выборгом, где он воевал и за что был награждён медалями «За оборону Ленинграда» и «За боевые заслуги»."
Add-Para "После Ленинградских сражений прадеду в составе 43-го стрелкового корпуса довелось с боями пройти через Прибалтику и завершать войну в Чехословакии и Германии. Об этом говорит медаль прадеда «За освобождение Праги»."

Add-Para "2.4 Жизнь после войны" "h2"
Add-Para "После войны прадед Иван закончил техникум, работал агрономом, заместителем председателя колхоза, 20 лет — директором совхоза «Снежный» в Челябинской области. В «Снежном» он оставил добрую память: были построены Дом быта, Дом культуры, большой магазин, две школы, жилой массив «Черёмушки», асфальтированы улицы. За большой вклад в развитие сельского хозяйства награждён орденами Ленина, Октябрьской Революции, Трудового Красного Знамени."
Add-Para "Вместе с моей прабабушкой Александрой Ивановной, участницей Великой Отечественной войны, они вырастили троих детей."
Add-Para "По возвращении домой прадед Ефим снова стал работать ветфельдшером. Более 40 лет работал добросовестно, был награждён орденом «Знак Почёта». Вместе с прабабушкой Ефросиньей Леонтьевной, труженицей тыла, вырастили семерых детей. Прабабушка награждена орденом «Материнская слава» III степени."
Add-Para "Так две семейные линии — Филоновы и Подгорбунских — соединились в одну большую семью. Дети, внуки и правнуки берегут награды, фотографии и документы своих ветеранов."

Add-PageBreak

# ---------------------------------------------------------------------------
# 3. Заключение
# ---------------------------------------------------------------------------

Add-Para "3. ЗАКЛЮЧЕНИЕ" "h1"
Add-Para "Пытаясь представить себе те ожесточённые бои за Родину, я поняла, какое счастье, что мы, нынешние дети, знаем о войне лишь понаслышке, из рассказов взрослых."
Add-Para "В ходе работы я узнала много интересного о своих прадедах. К сожалению, я их не застала. Мы пересмотрели много разных документов, но восстановить более точно события того времени оказалось очень сложно. Мы попытались."
Add-Para "Из всего, что я узнала, я поняла: мои прадедушки — настоящие герои. Мы должны это помнить, знать и не забывать. В своей семье мы храним память о тех, кого уже нет. Каждый год 9 Мая мы всей семьёй идём в «Бессмертном полку» с портретами наших ветеранов."
Add-Para "Отдельно хочу отметить, что собрать и оформить эти сведения помогла программа «Память рода». С её помощью я нашёл информацию о своих прадедах, сохранил найденные документы и подготовил этот отчёт. Главный вывод работы: память становится живой, когда мы не только знаем имена, но и передаём историю семьи дальше."
Add-Para "«Мы должны знать и помнить людей, которые подарили нам мирную жизнь». Эти слова стали главным итогом работы." "quote"
Add-Para "Работа над семейным архивом не заканчивается. Мы продолжим искать документы, уточнять даты и записывать воспоминания старших. Этот отчёт — ещё одна страница семейной памяти, которую мы передадим детям."

Add-PageBreak

# ---------------------------------------------------------------------------
# 4. Список источников
# ---------------------------------------------------------------------------

Add-Para "4. СПИСОК ИСПОЛЬЗОВАННОЙ ЛИТЕРАТУРЫ И ИСТОЧНИКОВ" "h1"
Add-Para "1. Бабин А. И. Карельский фронт в Великой Отечественной войне 1941—1945 гг." "bullet"
Add-Para "2. Василевский А. М. Дело всей жизни. Кн. 1. — М.: Политиздат, 1988." "bullet"
Add-Para "3. Справочник Генерального штаба ВС СССР «Боевой состав Советской армии»." "bullet"
Add-Para "4. Документы семейного архива: красноармейская книжка Е. И. Подгорбунских, удостоверения к наградам, наградные документы И. И. Филонова." "bullet"
Add-Para "5. Воспоминания П. Е. Подгорбунских и Л. И. Подгорбунских." "bullet"
Add-Para "6. Память народа: банк документов о Великой Отечественной войне. URL: https://pamyat-naroda.ru/" "bullet"
Add-Para "7. ОБД «Мемориал». URL: https://obd-memorial.ru/" "bullet"
Add-Para "8. Подвиг народа. URL: https://podvignaroda.ru/" "bullet"
Add-Para "9. Бессмертный полк. URL: https://www.moypolk.ru/" "bullet"

Add-PageBreak

# ---------------------------------------------------------------------------
# Приложение
# ---------------------------------------------------------------------------

Add-Para "ПРИЛОЖЕНИЕ. ХРОНИКА БОЕВОГО ПУТИ" "h1"
Add-Para "Хроника составлена по материалам семейного архива и исследовательской работы «Великая Отечественная война в моей семье»."

$rows = @(
  @("Год", "Филонов Иван Илларионович", "Подгорбунских Ефим Исакович"),
  @("1892", "—", "Родился в селе Введенское Челябинского уезда"),
  @("1913", "—", "Призван в царскую армию, служил унтер-офицером"),
  @("1916", "—", "На фронте Первой мировой войны"),
  @("1918—1922", "—", "Участвует в Гражданской войне в составе Красной армии"),
  @("1923", "Родился в селе Ново-Тарасовичи", "—"),
  @("1941", "Доброволец, Камышловское пехотное училище", "—"),
  @("1942", "Карельский фронт, бои под Мурманском; медаль «За оборону Советского Заполярья»", "Призван в 50 лет, подготовка в Чебаркуле, Ленинградский фронт"),
  @("1943", "Юго-Западный фронт, ранение под Харьковом; медаль «За отвагу»", "Бои на Синявинских высотах и под Выборгом"),
  @("1944", "—", "Участие в снятии блокады Ленинграда; Прибалтика"),
  @("1945", "—", "Завершение войны в Чехословакии; медаль «За освобождение Праги»"),
  @("После войны", "Директор совхоза «Снежный», ордена Ленина, Октябрьской Революции, Трудового Красного Знамени", "Ветфельдшер, орден «Знак Почёта»")
)
Add-Table $rows
Add-Para "Таблица составлена по документам семейного архива. Даты и названия частей могут уточняться по мере появления новых источников." "caption"

Add-Para "" "spacer"
Add-Para "Никто не забыт, ничто не забыто." "caption"

# ---------------------------------------------------------------------------
# Сборка пакета DOCX
# ---------------------------------------------------------------------------

$bodyXml = ($script:paras -join "")

$documentXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
__BODY__
<w:sectPr>
<w:footerReference w:type="default" r:id="rId2"/>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>
<w:cols w:space="708"/>
<w:titlePg/>
<w:docGrid w:linePitch="360"/>
</w:sectPr>
</w:body>
</w:document>
'@
$documentXml = $documentXml.Replace("__BODY__", $bodyXml)

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="0"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>
'@

$footerXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr><w:t>2</w:t></w:r>
<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="7B8078"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
</w:p>
</w:ftr>
'@

$settingsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:zoom w:percent="100"/>
<w:defaultTabStop w:val="709"/>
<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>
'@

$contentTypesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@

$rootRelsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@

$docRelsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>
'@

$coreXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Великая Отечественная война в моей семье</dc:title>
<dc:subject>Боевой путь Ивана Илларионовича Филонова и Ефима Исаковича Подгорбунских</dc:subject>
<dc:creator>Память рода</dc:creator>
<cp:keywords>семейный архив; Великая Отечественная война; Филонов; Подгорбунских</cp:keywords>
<dc:description>Семейное исследование, сформированное в сервисе «Память рода».</dc:description>
<cp:lastModifiedBy>Память рода</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-25T12:00:00Z</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-25T12:00:00Z</dcterms:modified>
</cp:coreProperties>
'@

$appXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Память рода</Application>
<DocSecurity>0</DocSecurity>
<ScaleCrop>false</ScaleCrop>
<Company>Семейный архив</Company>
<AppVersion>1.0</AppVersion>
</Properties>
'@

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$utf8 = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Path (Join-Path $buildDir "_rels") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $buildDir "word\_rels") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $buildDir "docProps") -Force | Out-Null
New-Item -ItemType Directory -Path $docsDir -Force | Out-Null

Write-Utf8File (Join-Path $buildDir "[Content_Types].xml") $contentTypesXml
Write-Utf8File (Join-Path $buildDir "_rels\.rels") $rootRelsXml
Write-Utf8File (Join-Path $buildDir "word\document.xml") $documentXml
Write-Utf8File (Join-Path $buildDir "word\styles.xml") $stylesXml
Write-Utf8File (Join-Path $buildDir "word\settings.xml") $settingsXml
Write-Utf8File (Join-Path $buildDir "word\footer1.xml") $footerXml
Write-Utf8File (Join-Path $buildDir "word\_rels\document.xml.rels") $docRelsXml
Write-Utf8File (Join-Path $buildDir "docProps\core.xml") $coreXml
Write-Utf8File (Join-Path $buildDir "docProps\app.xml") $appXml

# Проверка XML до упаковки
Get-ChildItem $buildDir -Recurse -Filter *.xml | ForEach-Object {
  try {
    [xml]([System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)) | Out-Null
  } catch {
    throw "Некорректный XML: $($_.FullName) — $($_.Exception.Message)"
  }
}

if (Test-Path $outputFile) { Remove-Item $outputFile -Force }
$zip = [System.IO.Compression.ZipFile]::Open($outputFile, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $files = Get-ChildItem $buildDir -Recurse -File
  foreach ($file in $files) {
    $entryName = $file.FullName.Substring($buildDir.Length).TrimStart('\', '/').Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

Remove-Item $buildDir -Recurse -Force

$info = Get-Item $outputFile
Write-Host ("DOCX готов: {0} ({1:N0} байт)" -f $info.FullName, $info.Length)
