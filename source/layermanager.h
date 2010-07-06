#ifndef LAYERMANAGER_H
#define LAYERMANAGER_H

#include <qvariant.h>
#include <qdialog.h>

class QVBoxLayout;
class QHBoxLayout;
class QGridLayout;
class QListBox;
class QListBoxItem;
class QPushButton;
class MapWindow;

class LayerManager : public QDialog {
Q_OBJECT

public:
	LayerManager( MapWindow* parent );
	~LayerManager();

	QListBox* listBox;
	QPushButton* buttonUp;
	QPushButton* buttonDown;
	QPushButton* buttonFColor;
	QPushButton* buttonLColor;
	QPushButton* buttonDone;

protected:
	QVBoxLayout* layout7;

signals:
	// none

protected slots:
	virtual void languageChange();
	virtual void moveUp();
	virtual void moveDown();
	virtual void changeFColor();
	virtual void changeLColor();

private:
	MapWindow* parentWindow;

};

#endif
