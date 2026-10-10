#include "cosmeticlayer.h"

CosmeticLayer::CosmeticLayer( QObject* parent ) : QObject( parent ) {
	shapes = new QPtrList<Shape>();
	_name = _path = "";
	_lineColor = QColor( 255,  0, 0 );
	_fillColor = QColor( 255,  0, 0 );
}

CosmeticLayer::CosmeticLayer( QObject* parent, const QString& scl ) : QObject( parent ) {
	shapes = new QPtrList<Shape>();

	_name = _path = scl;
	if ( !scl.endsWith( ".scl" ) ) {
		_name += ".scl";
		_path += ".scl";
	}

	_lineColor = QColor( 255,  0, 0 );
	_fillColor = QColor( 255,  0, 0 );

	// read the scl file and populate the shape list
	QFile file( _path );
	QDomDocument doc;
	if ( file.open( IO_ReadOnly ) ) {
		if ( doc.setContent( &file ) ) {
			QDomElement rootElement = doc.documentElement();

			QDomNode nodeShapes = rootElement.firstChild();		// <Shapes>

			QDomNode nodeShape = nodeShapes.firstChild();		// <Shape>
			QDomNode nodePoint;
			QDomElement elem;

			while ( !nodeShape.isNull() ) {
				QDomAttr attID = nodeShape.toElement().attributeNode( "Id" );
				QDomAttr attType = nodeShape.toElement().attributeNode( "Type" );
				int shapeID = attID.value().toInt();
				int shapeType = attType.value().toInt();

				nodePoint = nodeShape.firstChild();				// <Point>
				QPtrList<Point> points;
				while( !nodePoint.isNull() ) {
					QDomAttr attX = nodePoint.toElement().attributeNode( "X" );
					QDomAttr attY = nodePoint.toElement().attributeNode( "Y" );
					double x = attX.value().toDouble();
					double y = attY.value().toDouble();

					points.append( new Point( x, y ) );
					nodePoint = nodePoint.nextSibling();
				}

				Shape *shape;
				switch( shapeType ) {
				case 1:		shape = new ShapePoint( shapeID, points.first()->x(), points.first()->y() );
							addShape( shape );
							break;

				case 996:	shape = new ShapeCLLine( shapeID, points );
							addShape( shape );
							break;

				case 997:	shape = new ShapeCLCircle( shapeID,
													   *points.at(0),
													   Point( points.at(1)->x(), points.at(1)->y() ));
							addShape( shape );
							break;

				case 998:	shape = new ShapeCLPolygon( shapeID, points );
							addShape( shape );
							break;

				default:	break;// not yet implemented...
				};

				nodeShape = nodeShape.nextSibling();
			}
		}
	}
}

CosmeticLayer::~CosmeticLayer() {

}

void
CosmeticLayer::draw( double scaleFactor, QPainter& painter ) {
	painter.setPen( QPen( _lineColor, 2, Qt::SolidLine ) );
	painter.setBrush( _fillColor );

	QPtrListIterator<Shape> iterator( *shapes );

	while ( ( iterator.current() ) != 0 ) {
		iterator.current()->draw( scaleFactor, painter );
		++iterator;
    }
}

void
CosmeticLayer::setName( const QString& fn ) {
	_name = _path = fn;
	if ( !fn.endsWith( ".scl" ) ) {
		_name += ".scl";
		_path += ".scl";
	}
}

void
CosmeticLayer::setFillColor( const QColor& color ) {
	_fillColor.setRgb( color.red(), color.green(), color.blue() );
}

void
CosmeticLayer::setLineColor( const QColor& color ) {
	_lineColor.setRgb( color.red(), color.green(), color.blue() );
}

void
CosmeticLayer::addShape( Shape* shape ) {
	if ( shape )
		shapes->append( shape );
}

void
CosmeticLayer::removeShape( Shape* shape ) {

}

void
CosmeticLayer::save() {
	if ( !_path.isEmpty() ) {
		QFile file( _path );
		if ( !file.open( IO_WriteOnly ) )
			return;
		QTextStream ts( &file );
		ts << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" << endl;
		ts << "<SmartMapCosmeticLayer>" << endl;
		ts << "  <Shapes>" << endl;

		QPtrListIterator<Shape> iterator( *shapes );

		Shape *shape;
		while ( ( shape = iterator.current() ) != 0 ) {
			ts << "    <Shape Id=\"" + QString::number( shape->shapeID() ) +
				  "\" Type=\"" + QString::number( shape->type() ) + "\">" << endl;
			ts << shape->coordinates();
			ts << "    </Shape>" << endl;

			++iterator;
    	}

		ts << "  </Shapes>" << endl;
		ts << "</SmartMapCosmeticLayer>" << endl;

	}
}

int
CosmeticLayer::shapeCount() {
	return shapes->count();
}

QString
CosmeticLayer::path() {
	return _path;
}
