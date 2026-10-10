#include "maplayer.h"

MapLayer::MapLayer( QObject* parent, const QString& shapefile, QColor fillColor, QColor lineColor ) : QObject( parent ) {
	// _valid will be true if and only if the Shapefile is valid
	// and the MapLayer has been constructed successfully.
	_valid = false;
	shapes = new QPtrList<Shape>();

	QFile *file = new QFile( shapefile );
	if ( !file->open( IO_ReadOnly ) ) {
		_error = "Cannot open " + shapefile;
		return;
	}

	QDataStream stream( file );

	//------------------------------------------------------
	//  reading the header here...
		int unused;

		stream.setByteOrder( QDataStream::BigEndian );
		stream >> _fileCode;

		stream >> unused;
		stream >> unused;
		stream >> unused;
		stream >> unused;
		stream >> unused;
		stream >> _fileLength;

		stream.setByteOrder( QDataStream::LittleEndian );
		stream >> _version;
		stream >> _shapeType;

		int i;
		for ( i=0; i <= 7; i++ )
			stream >> _boundingBox[i];

	//	reading the records here
		int recNumber;
		int recLength;
		int shpType;
		Shape* shape = NULL;

		double *x, *y, box[4];
		int nPoints, nParts, *parts;

		while ( !stream.atEnd() ) {
			stream.setByteOrder( QDataStream::BigEndian );
			stream >> recNumber;
			stream >> recLength;

			stream.setByteOrder( QDataStream::LittleEndian );
			stream >> shpType;

			switch( shpType ) {
			case 0: 	shape = new NullShape( recNumber );
						break;

			case 1: 	double px, py;
						stream >> px; stream >> py;
						shape = new ShapePoint( recNumber, px, py );
						break;

			case 3:		stream >> box[0]; stream >> box[1]; stream >> box[2]; stream >> box[3];
						stream >> nParts; stream >> nPoints;
						parts = new int[nParts];
						for ( i=0; i<nParts; i++ )
							stream >> parts[i];
						x = new double[nPoints];
						y = new double[nPoints];
						for ( i=0; i<nPoints; i++ ) {
							stream >> x[i];
							stream >> y[i];
						}
						shape = new ShapePolyLine( recNumber, box, nParts, nPoints, parts, x, y );
						delete [] x; delete [] y; delete [] parts;
						break;

			case 5:		//double *x, *y, box[4];
						//int nPoints, nParts, *parts;
						stream >> box[0]; stream >> box[1]; stream >> box[2]; stream >> box[3];
						stream >> nParts; stream >> nPoints;
						parts = new int[nParts];
						for ( i=0; i<nParts; i++ )
							stream >> parts[i];
						x = new double[nPoints];
						y = new double[nPoints];
						for ( i=0; i<nPoints; i++ ) {
							stream >> x[i];
							stream >> y[i];
						}
						shape = new ShapePolygon( recNumber, box, nParts, nPoints, parts, x, y );
						delete [] x; delete [] y; delete [] parts;
						break;

			default:	break;
			};

			shapes->append( shape );
		}
		//QMessageBox::information( 0, "Shape Count", QString::number( shapes->count() ) );

	//------------------------------------------------------

	if ( !file )
		file->close();

	if ( _fileCode != 9994 ) {
		_error = "Invalid File Code.";
		return;
	}
	if ( !ShapeType::isValid( _shapeType ) ) {
		_error = "ShapeType not supported.";
		return;
	}

	_fileLength *= 2;		// convert words to bytes

	_path = shapefile;
	_name = shapefile;		// save the path of shapefile
	_name = shapefile;		// put the name of shapefile into the name
	_name.replace( "\\", "/" );
	_name.remove( 0, _name.findRev( "/" )+1 );
	_name.remove( _name.findRev( "." ), _name.length() );

	_fillColor.setRgb( fillColor.rgb() );
	_lineColor.setRgb( lineColor.rgb() );

	_visible = true;
	_valid = true;
}

MapLayer::~MapLayer() {

}

void
MapLayer::draw( double scaleFactor, QPainter& painter ) {
	switch( _shapeType ) {
		case 1:		painter.setPen( _lineColor );
					painter.setBrush( painter.pen().color() );
					break;

		case 3:		painter.setPen( QPen( _lineColor, 2, Qt::DashDotLine ) );
					painter.setBrush( painter.pen().color() );
					break;

		case 5:		painter.setPen( QPen( _lineColor, 1 ) );
					painter.setBrush( _fillColor );
					break;

		default:	painter.setPen( QPen( _lineColor, 1 ) );
					painter.setBrush( _fillColor );
	};

	QPtrListIterator<Shape> iterator( *shapes );

	Shape *shape;
	while ( ( shape = iterator.current() ) != 0 ) {
		shape->draw( scaleFactor, painter );
		++iterator;
    }
}

bool
MapLayer::valid() {
	return _valid;
}

QString	// returns the last error message
MapLayer::errorMessage() {
	return _error;
}

QString	// returns the name of this MapLayer
MapLayer::name() {
	return _name;
}

void	// sets the name of this MapLayer to newName
MapLayer::setName( const QString& newName ) {
	_name = newName;
}

QColor
MapLayer::fillColor() {
	return _fillColor;
}

void
MapLayer::setFillColor( const QColor& color ) {
	_fillColor.setRgb( color.red(), color.green(), color.blue() );
}

QColor
MapLayer::lineColor() {
	return _lineColor;
}

void
MapLayer::setLineColor( const QColor& color ) {
	_lineColor.setRgb( color.red(), color.green(), color.blue() );
}

int
MapLayer::shapeType() {
	return _shapeType;
}

int
MapLayer::fileCode() {
	return _fileCode;
}

int
MapLayer::version() {
	return _version;
}

int
MapLayer::fileLength() {
	return _fileLength;
}

bool
MapLayer::visible() {
	return _visible;
}

void
MapLayer::setVisible( bool flag ) {
	_visible = flag;
}

QString
MapLayer::shpPath() {
	return _path;
}
