/**
 * Plan Contable General Empresarial (PCGE 2019) - subconjunto operativo.
 *
 * No es el plan completo (que pasa de 700 cuentas): es el conjunto que una
 * empresa mediana usa en la practica, con toda la jerarquia necesaria para
 * que cada divisionaria cuelgue de su cuenta y de su elemento. El plan
 * completo se carga aparte; cada cliente agrega sus sub-divisionarias propias.
 *
 * Formato: [codigo, nombre, admiteMovimiento]
 * Solo las cuentas de ultimo nivel admiten movimiento: cargar en "60 Compras"
 * en vez de en "6011 Mercaderias manufacturadas" impide analizar y rompe el
 * libro electronico.
 */

type Row = [code: string, name: string, isPosting: boolean]

export const PCGE_ACCOUNTS: Row[] = [
  // --- Elemento 1: Activo disponible y exigible ---------------------------
  ['1', 'Activo disponible y exigible', false],
  ['10', 'Efectivo y equivalentes de efectivo', false],
  ['101', 'Caja', false],
  ['1011', 'Caja - moneda nacional', true],
  ['1012', 'Caja - moneda extranjera', true],
  ['104', 'Cuentas corrientes en instituciones financieras', false],
  ['1041', 'Cuentas corrientes operativas', true],
  ['1042', 'Cuentas corrientes para fines especificos', true],
  ['107', 'Fondos sujetos a restriccion', false],
  ['1071', 'Fondos sujetos a restriccion - detracciones', true],
  ['12', 'Cuentas por cobrar comerciales - terceros', false],
  ['121', 'Facturas, boletas y otros comprobantes por cobrar', false],
  ['1211', 'No emitidas', true],
  ['1212', 'Emitidas en cartera', true],
  ['122', 'Anticipos de clientes', false],
  ['1221', 'Anticipos recibidos de clientes', true],
  ['14', 'Cuentas por cobrar al personal, a los accionistas y directores', false],
  ['141', 'Personal', false],
  ['1411', 'Prestamos al personal', true],
  ['16', 'Cuentas por cobrar diversas - terceros', false],
  ['167', 'Tributos por acreditar', false],
  ['1673', 'Saldo a favor del exportador', true],
  ['168', 'Otras cuentas por cobrar diversas', true],
  ['18', 'Servicios y otros contratados por anticipado', false],
  ['181', 'Costos financieros', true],
  ['183', 'Alquileres', true],
  ['19', 'Estimacion de cuentas de cobranza dudosa', false],
  ['191', 'Cuentas por cobrar comerciales - terceros', true],

  // --- Elemento 2: Activo realizable ---------------------------------------
  ['2', 'Activo realizable', false],
  ['20', 'Mercaderias', false],
  ['201', 'Mercaderias manufacturadas', false],
  ['2011', 'Mercaderias manufacturadas - costo', true],
  ['21', 'Productos terminados', false],
  ['211', 'Productos manufacturados', true],
  ['24', 'Materias primas', false],
  ['241', 'Materias primas para productos manufacturados', true],
  ['25', 'Materiales auxiliares, suministros y repuestos', false],
  ['252', 'Suministros', true],
  ['253', 'Repuestos', true],
  ['29', 'Desvalorizacion de existencias', false],
  ['291', 'Mercaderias', true],

  // --- Elemento 3: Activo inmovilizado -------------------------------------
  ['3', 'Activo inmovilizado', false],
  ['33', 'Propiedades, planta y equipo', false],
  ['331', 'Terrenos', false],
  ['3311', 'Terrenos - urbanos', true],
  ['332', 'Edificaciones', false],
  ['3321', 'Edificaciones - administrativas', true],
  ['333', 'Maquinarias y equipos de explotacion', false],
  ['3331', 'Maquinarias y equipos de explotacion - costo', true],
  ['334', 'Unidades de transporte', false],
  ['3341', 'Vehiculos motorizados', true],
  ['335', 'Muebles y enseres', false],
  ['3351', 'Muebles', true],
  ['336', 'Equipos diversos', false],
  ['3361', 'Equipo para procesamiento de informacion', true],
  ['34', 'Intangibles', false],
  ['343', 'Programas de computadora (software)', true],
  ['39', 'Depreciacion, amortizacion y agotamiento acumulados', false],
  ['391', 'Depreciacion acumulada', false],
  ['3913', 'Propiedades, planta y equipo - costo', true],
  ['392', 'Amortizacion acumulada', false],
  ['3921', 'Intangibles - costo', true],

  // --- Elemento 4: Pasivo ---------------------------------------------------
  ['4', 'Pasivo', false],
  ['40', 'Tributos, contraprestaciones y aportes al sistema de pensiones y de salud por pagar', false],
  ['401', 'Gobierno central', false],
  ['4011', 'Impuesto general a las ventas', false],
  ['40111', 'IGV - cuenta propia', true],
  ['40112', 'IGV - servicios prestados por no domiciliados', true],
  ['4017', 'Impuesto a la renta', false],
  ['40171', 'Renta de tercera categoria', true],
  ['40172', 'Renta de cuarta categoria', true],
  ['40173', 'Renta de quinta categoria', true],
  ['403', 'Instituciones publicas', false],
  ['4031', 'EsSalud', true],
  ['4032', 'Oficina de Normalizacion Previsional (ONP)', true],
  ['407', 'Administradoras de fondos de pensiones', false],
  ['4071', 'Aportes al fondo de pensiones', true],
  ['41', 'Remuneraciones y participaciones por pagar', false],
  ['411', 'Remuneraciones por pagar', false],
  ['4111', 'Sueldos y salarios por pagar', true],
  ['413', 'Participaciones de los trabajadores por pagar', true],
  ['415', 'Beneficios sociales de los trabajadores por pagar', false],
  ['4151', 'Compensacion por tiempo de servicios', true],
  ['42', 'Cuentas por pagar comerciales - terceros', false],
  ['421', 'Facturas, boletas y otros comprobantes por pagar', false],
  ['4211', 'No emitidas', true],
  ['4212', 'Emitidas', true],
  ['422', 'Anticipos a proveedores', true],
  ['45', 'Obligaciones financieras', false],
  ['451', 'Prestamos de instituciones financieras y otras entidades', false],
  ['4511', 'Instituciones financieras', true],
  ['46', 'Cuentas por pagar diversas - terceros', false],
  ['469', 'Otras cuentas por pagar diversas', true],
  ['49', 'Pasivo diferido', false],
  ['491', 'Impuesto a la renta diferido', true],

  // --- Elemento 5: Patrimonio ----------------------------------------------
  ['5', 'Patrimonio neto', false],
  ['50', 'Capital', false],
  ['501', 'Capital social', false],
  ['5011', 'Acciones', true],
  ['5012', 'Participaciones', true],
  ['58', 'Reservas', false],
  ['582', 'Legal', true],
  ['59', 'Resultados acumulados', false],
  ['591', 'Utilidades no distribuidas', false],
  ['5911', 'Utilidades acumuladas', true],
  ['592', 'Perdidas acumuladas', false],
  ['5921', 'Perdidas acumuladas', true],

  // --- Elemento 6: Gastos por naturaleza -----------------------------------
  ['6', 'Gastos por naturaleza', false],
  ['60', 'Compras', false],
  ['601', 'Mercaderias', false],
  ['6011', 'Mercaderias manufacturadas', true],
  ['603', 'Materiales auxiliares, suministros y repuestos', false],
  ['6032', 'Suministros', true],
  ['61', 'Variacion de existencias', false],
  ['611', 'Mercaderias', false],
  ['6111', 'Mercaderias manufacturadas', true],
  ['62', 'Gastos de personal, directores y gerentes', false],
  ['621', 'Remuneraciones', false],
  ['6211', 'Sueldos y salarios', true],
  ['6214', 'Gratificaciones', true],
  ['6215', 'Vacaciones', true],
  ['627', 'Seguridad, prevision social y otras contribuciones', false],
  ['6271', 'Regimen de prestaciones de salud', true],
  ['6274', 'Seguro complementario de trabajo de riesgo', true],
  ['63', 'Gastos de servicios prestados por terceros', false],
  ['631', 'Transporte, correos y gastos de viaje', false],
  ['6311', 'Transporte', true],
  ['634', 'Mantenimiento y reparaciones', false],
  ['6343', 'Inmuebles, maquinaria y equipo', true],
  ['635', 'Alquileres', false],
  ['6352', 'Edificaciones', true],
  ['636', 'Servicios basicos', false],
  ['6361', 'Energia electrica', true],
  ['6363', 'Agua', true],
  ['6364', 'Telefono', true],
  ['6365', 'Internet', true],
  ['637', 'Publicidad, publicaciones, relaciones publicas', false],
  ['6371', 'Publicidad', true],
  ['639', 'Otros servicios prestados por terceros', true],
  ['64', 'Gastos por tributos', false],
  ['641', 'Gobierno central', false],
  ['6411', 'Impuesto general a las ventas y selectivo al consumo', true],
  ['643', 'Gobierno local', false],
  ['6431', 'Impuesto predial', true],
  ['65', 'Otros gastos de gestion', false],
  ['653', 'Suscripciones', true],
  ['656', 'Suministros', true],
  ['659', 'Otros gastos de gestion', true],
  ['68', 'Valuacion y deterioro de activos y provisiones', false],
  ['681', 'Depreciacion', false],
  ['6814', 'Depreciacion de propiedades, planta y equipo - costo', true],
  ['684', 'Valuacion de activos', false],
  ['6841', 'Estimacion de cuentas de cobranza dudosa', true],

  // --- Elemento 7: Ingresos -------------------------------------------------
  ['7', 'Ingresos', false],
  ['70', 'Ventas', false],
  ['701', 'Mercaderias', false],
  ['7011', 'Mercaderias manufacturadas', true],
  ['702', 'Productos terminados', false],
  ['7021', 'Productos manufacturados', true],
  ['704', 'Prestacion de servicios', false],
  ['7041', 'Terceros', true],
  ['73', 'Descuentos, rebajas y bonificaciones obtenidos', false],
  ['731', 'Descuentos, rebajas y bonificaciones obtenidos', true],
  ['74', 'Descuentos, rebajas y bonificaciones concedidos', false],
  ['741', 'Descuentos, rebajas y bonificaciones concedidos', true],
  ['75', 'Otros ingresos de gestion', false],
  ['751', 'Servicios en beneficio del personal', true],
  ['759', 'Otros ingresos de gestion', true],
  ['77', 'Ingresos financieros', false],
  ['772', 'Rendimientos ganados', true],
  ['79', 'Cargas imputables a cuentas de costos y gastos', false],
  ['791', 'Cargas imputables a cuentas de costos y gastos', true],

  // --- Elemento 9: Contabilidad analitica ----------------------------------
  ['9', 'Contabilidad analitica de explotacion', false],
  ['94', 'Gastos administrativos', true],
  ['95', 'Gastos de ventas', true],
]

export interface SeedAccount {
  code: string
  name: string
  level: number
  element: string
  parent: string | null
  nature: 'DEUDORA' | 'ACREEDORA'
  isPosting: boolean
  active: boolean
}

/** Convierte la tabla plana en filas listas para insertar. */
export function buildPcgeRows(): SeedAccount[] {
  return PCGE_ACCOUNTS.map(([code, name, isPosting]) => ({
    code,
    name,
    level: code.length,
    element: code[0] as string,
    parent: code.length > 1 ? code.slice(0, -1) : null,
    // Misma regla que el value object AccountCode: 4, 5 y 7 son acreedoras.
    nature: ['4', '5', '7'].includes(code[0] as string)
      ? ('ACREEDORA' as const)
      : ('DEUDORA' as const),
    isPosting,
    active: true,
  }))
}
